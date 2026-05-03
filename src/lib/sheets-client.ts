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

/**
 * Sleep helper for backoff between retries.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Detect Google Sheets API rate limit / quota errors.
 * Google returns either:
 *   - HTTP 429 with code 'RESOURCE_EXHAUSTED'
 *   - HTTP 403 with reason 'rateLimitExceeded' or 'userRateLimitExceeded'
 * The googleapis client wraps these in GaxiosError. We check both
 * .code (numeric or string) and the error message text.
 */
function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: number | string; message?: string; status?: number };
  if (e.code === 429 || e.code === "429") return true;
  if (e.status === 429) return true;
  const msg = (e.message ?? "").toLowerCase();
  return (
    msg.includes("quota exceeded") ||
    msg.includes("rate limit") ||
    msg.includes("rate_limit") ||
    msg.includes("ratelimitexceeded") ||
    msg.includes("resource_exhausted") ||
    msg.includes("user_rate_limit")
  );
}

/**
 * Wrap a Sheets API call in retry-with-backoff for rate limit
 * errors. Google's quotas are per-minute, so we wait increasingly
 * long between attempts.
 *
 * Backoff schedule: 2s, 5s, 10s (= 17s total max wait).
 * After 3 attempts we give up and throw the original error.
 *
 * Non-rate-limit errors are NOT retried — they bubble up
 * immediately.
 *
 * Exported so provisioning + repair can use the same retry
 * logic without duplicating the backoff schedule.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string
): Promise<T> {
  const delays = [2000, 5000, 10000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRateLimitError(err)) throw err;
      if (attempt === delays.length) break;
      const wait = delays[attempt];
      console.warn(
        `[sheets-client] ${label} hit rate limit; retrying in ${wait}ms (attempt ${attempt + 1}/${delays.length})`
      );
      await sleep(wait);
    }
  }
  throw lastErr;
}

export class SheetsClient {
  constructor(
    private readonly sheets: sheets_v4.Sheets,
    private readonly config: SheetsClientConfig
  ) {}

  /**
   * Per-instance cache for table header rows. Header order rarely
   * changes during a single function invocation, so caching saves
   * a Sheets API read per write — significant when bulk-writing
   * 12+ invoices in one scan.
   *
   * Cleared automatically when the SheetsClient instance is gc'd
   * (i.e. between requests). No manual invalidation needed for
   * normal operations; if a write extends the header (rare —
   * only schema repair does this), that codepath uses a fresh
   * client.
   */
  private headerCache = new Map<TableName, string[]>();

  /**
   * Per-instance cache for the highest ID counter per table per
   * day. generateId() reads all rows to find the next N for
   * today's prefix. Cache that count after the first read so
   * subsequent generateId() calls within the same scan just
   * increment without re-reading.
   *
   * Format: { '30_invoices_out:030526': 5 } means 5 rows already
   * created today for that table.
   */
  private idCounterCache = new Map<string, number>();

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
    const id = await this.generateId(table);
    const now = new Date().toISOString();

    const row: Row<T> = {
      id,
      created_at: now,
      updated_at: now,
      deleted_at: "",
      ...data,
    } as Row<T>;

    // Align to the ACTUAL Sheet header. If the sheet is missing
    // columns the schema added (user hasn't run schema repair),
    // those fields are silently dropped — better than corrupting
    // existing rows by writing into the wrong column positions.
    const header = await this.readHeader(table);
    const values = [
      header.map((col) => {
        const v = (row as Record<string, unknown>)[col];
        return v === undefined ? "" : String(v);
      }),
    ];

    await withRetry(
      () =>
        this.sheets.spreadsheets.values.append({
          spreadsheetId: this.config.spreadsheetId,
          range: `${table}!A:Z`,
          valueInputOption: "RAW",
          insertDataOption: "INSERT_ROWS",
          requestBody: { values },
        }),
      `append(${table})`
    );

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
    const now = new Date().toISOString();

    const row: Row<T> = {
      id,
      created_at: now,
      updated_at: now,
      deleted_at: "",
      ...data,
    } as Row<T>;

    const header = await this.readHeader(table);
    const values = [
      header.map((col) => {
        const v = (row as Record<string, unknown>)[col];
        return v === undefined ? "" : String(v);
      }),
    ];

    await withRetry(
      () =>
        this.sheets.spreadsheets.values.append({
          spreadsheetId: this.config.spreadsheetId,
          range: `${table}!A:Z`,
          valueInputOption: "RAW",
          insertDataOption: "INSERT_ROWS",
          requestBody: { values },
        }),
      `append(${table})`
    );

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

    const header = await this.readHeader(table);
    const values = [
      header.map((col) => {
        const v = (updated as Record<string, unknown>)[col];
        return v === undefined ? "" : String(v);
      }),
    ];

    // Sheets API rows are 1-indexed; row 1 is headers, so data row N
    // is sheet row N+2 (target.index is 0-indexed within data rows)
    const sheetRowNumber = target.index + 2;

    await withRetry(
      () =>
        this.sheets.spreadsheets.values.update({
          spreadsheetId: this.config.spreadsheetId,
          range: `${table}!A${sheetRowNumber}:${columnLetter(header.length)}${sheetRowNumber}`,
          valueInputOption: "RAW",
          requestBody: { values },
        }),
      `update(${table})`
    );

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
    await withRetry(
      () =>
        this.sheets.spreadsheets.values.update({
          spreadsheetId: this.config.spreadsheetId,
          range: `${table}!C${sheetRowNumber}:D${sheetRowNumber}`,
          valueInputOption: "RAW",
          requestBody: { values: [[now, now]] },
        }),
      `softDelete(${table})`
    );

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

    await withRetry(
      () =>
        this.sheets.spreadsheets.values.update({
          spreadsheetId: this.config.spreadsheetId,
          range: `${table}!C${sheetRowNumber}:D${sheetRowNumber}`,
          valueInputOption: "RAW",
          requestBody: { values: [[now, ""]] },
        }),
      `restore(${table})`
    );

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
    // Read the ACTUAL header row from the sheet rather than
    // assuming it matches schema.cols. Header order is the source
    // of truth — if it's out of sync with schema (e.g. user hasn't
    // run schema repair after a column was added), reading by
    // schema.cols would put values in the wrong fields.
    //
    // We read A1:Z to capture both header and data in one round
    // trip. Row 1 is header, rows 2+ are data.
    const response = await withRetry(
      () =>
        this.sheets.spreadsheets.values.get({
          spreadsheetId: this.config.spreadsheetId,
          range: `${table}!A1:Z`,
        }),
      `readAllRowsWithIndex(${table})`
    );

    const allValues = response.data.values ?? [];
    if (allValues.length === 0) return [];

    const header = (allValues[0] ?? []) as string[];
    // Populate header cache as a side benefit — readAllRowsWithIndex
    // is already paying for the header row, no point reading it
    // again later
    this.headerCache.set(table, header.filter((h) => !!h));

    const dataRows = allValues.slice(1);

    return dataRows.map((rowValues, index) => {
      const row: Record<string, unknown> = {};
      header.forEach((col, i) => {
        if (col) row[col] = rowValues[i] ?? "";
      });
      return { index, row: row as Row };
    });
  }

  /**
   * Read just the sheet header row (column names in order).
   * Used by writers to align data positions to the actual
   * Sheet layout rather than the TS schema (which may be ahead
   * of what's in the sheet if schema repair hasn't run yet).
   */
  private async readHeader(table: TableName): Promise<string[]> {
    // Cached? Return it. Header order is stable within a single
    // SheetsClient lifetime (one HTTP request).
    const cached = this.headerCache.get(table);
    if (cached) return cached;

    const response = await withRetry(
      () =>
        this.sheets.spreadsheets.values.get({
          spreadsheetId: this.config.spreadsheetId,
          range: `${table}!A1:Z1`,
        }),
      `readHeader(${table})`
    );
    const header = ((response.data.values?.[0] ?? []) as string[]).filter(
      (h) => !!h
    );
    this.headerCache.set(table, header);
    return header;
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
    const cacheKey = `${table}:${today}`;

    // Cached counter? Increment and return — saves a full table
    // read for every subsequent ID generation in the same scan.
    const cached = this.idCounterCache.get(cacheKey);
    if (cached !== undefined) {
      const next = cached + 1;
      this.idCounterCache.set(cacheKey, next);
      return `${prefix}${next}`;
    }

    // First call: read existing IDs to find the highest N for today
    const allRows = await this.readAllRows(table);
    const todaysIds = allRows
      .map((r) => r.id)
      .filter((id) => id.startsWith(prefix));

    const highestN = todaysIds.reduce((max, id) => {
      const n = parseInt(id.slice(prefix.length), 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);

    const next = highestN + 1;
    this.idCounterCache.set(cacheKey, next);
    return `${prefix}${next}`;
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

      await withRetry(
        () =>
          this.sheets.spreadsheets.values.append({
            spreadsheetId: this.config.spreadsheetId,
            range: `99_audit_log!A:Z`,
            valueInputOption: "RAW",
            insertDataOption: "INSERT_ROWS",
            requestBody: { values: [row] },
          }),
        `append(99_audit_log)`
      );
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
