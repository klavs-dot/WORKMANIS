/**
 * Sheets API client — server-side only.
 *
 * Type-safe CRUD on top of googleapis. Every operation:
 *   - Auto-generates IDs in {prefix}-{DDMMYY}-{N} format
 *   - Sets created_at, updated_at, deleted_at = '' on insert
 *   - Bumps updated_at on update (optimistic locking validates
 *     that the client-supplied updated_at matches what's in the
 *     sheet before writing)
 *   - Soft delete: sets deleted_at instead of removing rows
 *   - Writes a corresponding entry to 99_audit_log so every
 *     mutation is traceable
 *
 * NOT browser-safe — uses google-auth-library and reads the
 * user's OAuth access token. Always import from server code
 * (API routes, server actions) only.
 *
 * Usage (from a Next.js API route):
 *
 *   import { auth } from '@/auth';
 *   import { createSheetsClient } from '@/lib/sheets-client';
 *
 *   const session = await auth();
 *   const client = createSheetsClient({
 *     accessToken: session.accessToken,
 *     spreadsheetId: company.sheet_id,
 *     actor: session.user.email,
 *   });
 *
 *   const created = await client.create('10_clients', {
 *     name: 'Jaunais klients',
 *     type: 'legal',
 *     country_code: 'LV',
 *   });
 */

import { google, type sheets_v4 } from "googleapis";
import { COMPANY_TABS, type TableName, getTableSchema } from "./sheets-schema";

// ============================================================
// Types
// ============================================================

export interface SheetsClientConfig {
  /** OAuth access token from the authenticated user's session */
  accessToken: string;
  /** Drive file ID of the company.gsheet to operate on */
  spreadsheetId: string;
  /** Email of the user performing the action — written to audit log */
  actor: string;
}

/** Universal columns present on every row */
export interface UniversalRow {
  id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string;
}

/** A row as stored in Sheets — universal columns + table-specific cols */
export type Row<T = Record<string, unknown>> = UniversalRow & T;

/** Input for create — caller supplies only business fields */
export type CreateInput<T = Record<string, unknown>> = T;

/**
 * Input for update — caller MUST supply the current updated_at
 * for optimistic locking. If it doesn't match what's in the sheet,
 * the update is rejected.
 */
export type UpdateInput<T = Record<string, unknown>> = Partial<T> & {
  expected_updated_at: string;
};

export class OptimisticLockError extends Error {
  constructor(
    public readonly id: string,
    public readonly expectedUpdatedAt: string,
    public readonly actualUpdatedAt: string
  ) {
    super(
      `Optimistic lock failed for ${id}: expected updated_at=${expectedUpdatedAt}, got ${actualUpdatedAt}. ` +
        `Another user likely modified this row. Refresh and try again.`
    );
    this.name = "OptimisticLockError";
  }
}

export class RowNotFoundError extends Error {
  constructor(
    public readonly table: TableName,
    public readonly id: string
  ) {
    super(`Row not found: ${table}.${id}`);
    this.name = "RowNotFoundError";
  }
}

// ============================================================
// Client factory
// ============================================================

export function createSheetsClient(config: SheetsClientConfig) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: config.accessToken });
  const sheets = google.sheets({ version: "v4", auth: oauth2Client });

  return new SheetsClient(sheets, config);
}

// ============================================================
// Client implementation
// ============================================================

export class SheetsClient {
  constructor(
    private readonly sheets: sheets_v4.Sheets,
    private readonly config: SheetsClientConfig
  ) {}

  /**
   * List all non-deleted rows from a table.
   * Soft-deleted rows (deleted_at != '') are filtered out.
   */
  async list<T = Record<string, unknown>>(
    table: TableName,
    options?: { includeDeleted?: boolean }
  ): Promise<Row<T>[]> {
    const rows = await this.readAllRows(table);
    if (options?.includeDeleted) return rows as Row<T>[];
    return rows.filter((r) => !r.deleted_at) as Row<T>[];
  }

  /**
   * Get a single row by ID. Returns null if not found or soft-deleted
   * (unless includeDeleted is true).
   */
  async get<T = Record<string, unknown>>(
    table: TableName,
    id: string,
    options?: { includeDeleted?: boolean }
  ): Promise<Row<T> | null> {
    const all = await this.readAllRows(table);
    const found = all.find((r) => r.id === id);
    if (!found) return null;
    if (found.deleted_at && !options?.includeDeleted) return null;
    return found as Row<T>;
  }

  /**
   * Insert a new row. Auto-generates id, created_at, updated_at.
   * Returns the row as inserted (with the generated id).
   */
  async create<T = Record<string, unknown>>(
    table: TableName,
    data: CreateInput<T>
  ): Promise<Row<T>> {
    const schema = getTableSchema(table);
    const id = await this.generateId(table);
    const now = new Date().toISOString();

    const row: Row<T> = {
      id,
      created_at: now,
      updated_at: now,
      deleted_at: "",
      ...data,
    } as Row<T>;

    const allCols = ["id", "created_at", "updated_at", "deleted_at", ...schema.cols];
    const values = [
      allCols.map((col) => {
        const v = (row as Record<string, unknown>)[col];
        return v === undefined ? "" : String(v);
      }),
    ];

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.config.spreadsheetId,
      range: `${table}!A:Z`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values },
    });

    await this.writeAuditLog({
      action: "create",
      entity_table: table,
      entity_id: id,
      changes_json: JSON.stringify(row),
    });

    return row;
  }

  /**
   * Insert a new row WITH A SPECIFIC ID rather than auto-generating
   * one. Used for singleton tabs where there's a known fixed id
   * (e.g. 01_requisites where there's only ever one row per
   * company and the id is always 'req-001').
   *
   * Doesn't check for duplicates — caller is expected to verify
   * the id doesn't already exist before calling. Use update() for
   * the existing-row case.
   */
  async createWithFixedId<T = Record<string, unknown>>(
    table: TableName,
    id: string,
    data: CreateInput<T>
  ): Promise<Row<T>> {
    const schema = getTableSchema(table);
    const now = new Date().toISOString();

    const row: Row<T> = {
      id,
      created_at: now,
      updated_at: now,
      deleted_at: "",
      ...data,
    } as Row<T>;

    const allCols = ["id", "created_at", "updated_at", "deleted_at", ...schema.cols];
    const values = [
      allCols.map((col) => {
        const v = (row as Record<string, unknown>)[col];
        return v === undefined ? "" : String(v);
      }),
    ];

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.config.spreadsheetId,
      range: `${table}!A:Z`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values },
    });

    await this.writeAuditLog({
      action: "create",
      entity_table: table,
      entity_id: id,
      changes_json: JSON.stringify(row),
    });

    return row;
  }

  /**
   * Update fields on an existing row. Requires expected_updated_at
   * for optimistic locking — if the row was modified after the
   * caller read it, the update is rejected.
   */
  async update<T = Record<string, unknown>>(
    table: TableName,
    id: string,
    patch: UpdateInput<T>
  ): Promise<Row<T>> {
    const { expected_updated_at, ...changes } = patch;

    // Find the row and its 1-indexed sheet row number
    const allRows = await this.readAllRowsWithIndex(table);
    const target = allRows.find((r) => r.row.id === id);
    if (!target) throw new RowNotFoundError(table, id);

    if (target.row.updated_at !== expected_updated_at) {
      throw new OptimisticLockError(
        id,
        expected_updated_at,
        target.row.updated_at
      );
    }

    // Compute the new row state
    const now = new Date().toISOString();
    const updated = {
      ...target.row,
      ...changes,
      updated_at: now,
    } as Row<T>;

    const schema = getTableSchema(table);
    const allCols = ["id", "created_at", "updated_at", "deleted_at", ...schema.cols];
    const values = [
      allCols.map((col) => {
        const v = (updated as Record<string, unknown>)[col];
        return v === undefined ? "" : String(v);
      }),
    ];

    // Sheets API rows are 1-indexed; row 1 is headers, so data row N
    // is sheet row N+2 (target.index is 0-indexed within data rows)
    const sheetRowNumber = target.index + 2;

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.config.spreadsheetId,
      range: `${table}!A${sheetRowNumber}:${columnLetter(allCols.length)}${sheetRowNumber}`,
      valueInputOption: "RAW",
      requestBody: { values },
    });

    await this.writeAuditLog({
      action: "update",
      entity_table: table,
      entity_id: id,
      changes_json: JSON.stringify(
        diffFields(
          target.row as Record<string, unknown>,
          updated as unknown as Record<string, unknown>
        )
      ),
    });

    return updated;
  }

  /**
   * Soft delete — sets deleted_at to current timestamp.
   * Row is preserved in the sheet for audit purposes; subsequent
   * list() and get() calls will hide it (unless includeDeleted=true).
   */
  async softDelete(
    table: TableName,
    id: string,
    expected_updated_at: string
  ): Promise<void> {
    const allRows = await this.readAllRowsWithIndex(table);
    const target = allRows.find((r) => r.row.id === id);
    if (!target) throw new RowNotFoundError(table, id);

    if (target.row.updated_at !== expected_updated_at) {
      throw new OptimisticLockError(
        id,
        expected_updated_at,
        target.row.updated_at
      );
    }

    const now = new Date().toISOString();
    const sheetRowNumber = target.index + 2;

    // Update only the deleted_at (col D) and updated_at (col C) cells
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.config.spreadsheetId,
      range: `${table}!C${sheetRowNumber}:D${sheetRowNumber}`,
      valueInputOption: "RAW",
      requestBody: { values: [[now, now]] },
    });

    await this.writeAuditLog({
      action: "delete",
      entity_table: table,
      entity_id: id,
      changes_json: JSON.stringify({ deleted_at: ["", now] }),
    });
  }

  /**
   * Restore a previously soft-deleted row by clearing deleted_at.
   */
  async restore(
    table: TableName,
    id: string,
    expected_updated_at: string
  ): Promise<void> {
    const allRows = await this.readAllRowsWithIndex(table);
    const target = allRows.find((r) => r.row.id === id);
    if (!target) throw new RowNotFoundError(table, id);

    if (target.row.updated_at !== expected_updated_at) {
      throw new OptimisticLockError(
        id,
        expected_updated_at,
        target.row.updated_at
      );
    }

    const now = new Date().toISOString();
    const sheetRowNumber = target.index + 2;

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.config.spreadsheetId,
      range: `${table}!C${sheetRowNumber}:D${sheetRowNumber}`,
      valueInputOption: "RAW",
      requestBody: { values: [[now, ""]] },
    });

    await this.writeAuditLog({
      action: "restore",
      entity_table: table,
      entity_id: id,
      changes_json: JSON.stringify({
        deleted_at: [target.row.deleted_at, ""],
      }),
    });
  }

  // ============================================================
  // Internal helpers
  // ============================================================

  /**
   * Read raw values from a sheet tab and parse into typed rows.
   * Returns rows in the order they appear in the sheet.
   */
  private async readAllRows(table: TableName): Promise<Row[]> {
    const result = await this.readAllRowsWithIndex(table);
    return result.map((r) => r.row);
  }

  /**
   * Same as readAllRows but also returns the 0-indexed position of
   * each row within the data rows (excluding the header row). Used
   * by update/softDelete to locate the right sheet row to write to.
   */
  private async readAllRowsWithIndex(
    table: TableName
  ): Promise<{ index: number; row: Row }[]> {
    const schema = getTableSchema(table);
    const allCols = ["id", "created_at", "updated_at", "deleted_at", ...schema.cols];

    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.config.spreadsheetId,
      range: `${table}!A2:${columnLetter(allCols.length)}`,
    });

    const values = response.data.values ?? [];
    return values.map((rowValues, index) => {
      const row: Record<string, unknown> = {};
      allCols.forEach((col, i) => {
        row[col] = rowValues[i] ?? "";
      });
      return { index, row: row as Row };
    });
  }

  /**
   * Generate an ID in {prefix}-{DDMMYY}-{N} format. The prefix
   * comes from the table schema; N is incremented based on the
   * highest existing N for that day.
   */
  private async generateId(table: TableName): Promise<string> {
    const schema = getTableSchema(table);
    const today = ddmmyy(new Date());
    const prefix = `${schema.idPrefix}-${today}-`;

    // Read existing IDs to find the highest N for today
    const allRows = await this.readAllRows(table);
    const todaysIds = allRows
      .map((r) => r.id)
      .filter((id) => id.startsWith(prefix));

    const highestN = todaysIds.reduce((max, id) => {
      const n = parseInt(id.slice(prefix.length), 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);

    return `${prefix}${highestN + 1}`;
  }

  /**
   * Append an entry to the 99_audit_log tab. Audit log writes
   * never throw — failures are logged but don't block the parent
   * mutation (the alternative would be losing data on log issues).
   */
  private async writeAuditLog(entry: {
    action: "create" | "update" | "delete" | "restore";
    entity_table: TableName;
    entity_id: string;
    changes_json: string;
  }): Promise<void> {
    try {
      const auditId = await this.generateId("99_audit_log");
      const now = new Date().toISOString();

      const row = [
        auditId,
        now,
        now,
        "", // deleted_at — audit log entries are never soft-deleted in practice
        now, // timestamp (E)
        this.config.actor, // actor (F)
        entry.action, // action (G)
        entry.entity_table, // entity_table (H)
        entry.entity_id, // entity_id (I)
        entry.changes_json, // changes_json (J)
        "", // ip_address (K)
        "", // user_agent (L)
      ];

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.config.spreadsheetId,
        range: `99_audit_log!A:Z`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [row] },
      });
    } catch (err) {
      console.error("Audit log write failed:", err);
      // Intentionally swallow — don't fail the parent operation
    }
  }
}

// ============================================================
// Pure helpers (no side effects, easily testable)
// ============================================================

/** Format a Date as DDMMYY (used in ID generation) */
function ddmmyy(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}${mm}${yy}`;
}

/**
 * Convert a 1-indexed column number to spreadsheet letter notation.
 * 1 → A, 26 → Z, 27 → AA, 52 → AZ, 53 → BA, etc.
 */
function columnLetter(col: number): string {
  let result = "";
  while (col > 0) {
    const rem = (col - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    col = Math.floor((col - 1) / 26);
  }
  return result;
}

/**
 * Compute a diff object between two row states. Returns only the
 * fields that changed, as { field: [oldValue, newValue] }.
 */
function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, [unknown, unknown]> {
  const diff: Record<string, [unknown, unknown]> = {};
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of allKeys) {
    if (before[key] !== after[key]) {
      diff[key] = [before[key], after[key]];
    }
  }
  return diff;
}
