/**
 * Company provisioning — server-side only.
 *
 * Creates the full Drive + Sheets infrastructure when a user adds
 * a new company. This is the TypeScript equivalent of setupCompany()
 * in Apps Script setup-script.gs, but integrated into our Next.js
 * stack for unified debugging and typing.
 *
 * Three levels of infrastructure this module creates:
 *
 *   1. Platform root (once per user account):
 *      WORKMANIS/
 *      WORKMANIS/_platform/
 *      WORKMANIS/accounts/{user-email}/
 *      WORKMANIS/accounts/{user-email}/_account/account-master.gsheet
 *      WORKMANIS/accounts/{user-email}/companies/
 *
 *   2. Company folder + sheet (once per company):
 *      WORKMANIS/accounts/{user-email}/companies/WORKMANIS_{SLUG}/
 *      WORKMANIS/accounts/.../WORKMANIS_{SLUG}/company.gsheet (25 tabs)
 *      WORKMANIS/accounts/.../WORKMANIS_{SLUG}/{18 subfolders}/
 *
 *   3. Row in account-master.gsheet/01_companies tracking this company.
 *
 * Idempotent at every level — safe to run repeatedly. If a folder
 * or file already exists (matched by name within parent), it is
 * reused rather than duplicated.
 *
 * NOT browser-safe — uses 'googleapis' which is node-only.
 */

import { google, type drive_v3, type sheets_v4 } from "googleapis";
import { COMPANY_TABS } from "./sheets-schema";

// ============================================================
// Types
// ============================================================

export interface ProvisioningContext {
  /** OAuth access token from the authenticated user's session */
  accessToken: string;
  /** User's email — used as the account slug under accounts/ */
  userEmail: string;
}

export interface CompanyRequisites {
  name: string;
  legal_name: string;
  reg_number: string;
  vat_number?: string;
  address?: string;
  iban?: string;
  bic?: string;
  phone?: string;
  email?: string;
  website?: string;
  director_name?: string;
  director_position?: string;
}

export interface ProvisionedCompany {
  /** The slug used as the Drive folder name, e.g. 'WORKMANIS_MOSPHERA' */
  slug: string;
  /** Drive file ID of the company folder */
  folderId: string;
  /** Drive file ID of company.gsheet */
  sheetId: string;
  /** ID of the row inserted into account-master.gsheet/01_companies */
  accountMasterCompanyId: string;
}

export class ProvisioningError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "ProvisioningError";
  }
}

// ============================================================
// Constants — single source of truth for folder layout
// ============================================================

const ROOT_FOLDER_NAME = "WORKMANIS";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const SHEETS_MIME = "application/vnd.google-apps.spreadsheet";

const COMPANY_SUBFOLDERS = [
  "invoices-out",
  "invoices-in",
  "pn-akti",
  "delivery-notes",
  "contracts/employees",
  "contracts/clients",
  "contracts/suppliers",
  "contracts/partners",
  "employees",
  "salaries",
  "taxes",
  "assets/domains",
  "assets/vehicles",
  "assets/other",
  "reports",
  "exports",
  "branding",
  "misc/documents",
];

const ACCOUNT_MASTER_TABS = [
  {
    name: "01_companies",
    cols: [
      "slug",
      "name",
      "legal_name",
      "reg_number",
      "folder_drive_id",
      "sheet_id",
      "status",
      "created_by",
      "last_activity_at",
    ],
  },
  {
    name: "02_users",
    cols: [
      "email",
      "name",
      "role",
      "invited_at",
      "accepted_at",
      "last_login_at",
      "company_access",
    ],
  },
  {
    name: "03_settings",
    cols: ["key", "value", "description"],
  },
];

// ============================================================
// Public entry point
// ============================================================

/**
 * Provision a new company. Idempotent — if the company slug already
 * exists in the user's account, returns the existing IDs rather than
 * creating duplicates.
 *
 * Order of operations:
 *   1. Ensure platform root + account folder + account-master.gsheet
 *      exist (no-ops if already set up from a previous company)
 *   2. Create the company folder + all subfolders
 *   3. Create company.gsheet with all 25 tabs
 *   4. Seed 01_requisites row
 *   5. Append a row to account-master.gsheet/01_companies
 *
 * If any step fails partway through, the caller gets a
 * ProvisioningError. Already-created resources remain in Drive
 * (not cleaned up) — re-running this function picks up where it
 * stopped because every step is idempotent.
 */
export async function provisionCompany(
  ctx: ProvisioningContext,
  requisites: CompanyRequisites
): Promise<ProvisionedCompany> {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: ctx.accessToken });
  const drive = google.drive({ version: "v3", auth: oauth2 });
  const sheets = google.sheets({ version: "v4", auth: oauth2 });

  try {
    // Step 1: Platform root
    const rootId = await findOrCreateFolder(drive, ROOT_FOLDER_NAME, null);
    const platformId = await findOrCreateFolder(drive, "_platform", rootId);
    await findOrCreateFolder(drive, "backups", platformId);
    await findOrCreateFolder(drive, "templates", platformId);
    const accountsRootId = await findOrCreateFolder(drive, "accounts", rootId);

    // Step 2: User's account folder
    const accountFolderId = await findOrCreateFolder(
      drive,
      ctx.userEmail,
      accountsRootId
    );
    const accountInternalId = await findOrCreateFolder(
      drive,
      "_account",
      accountFolderId
    );
    await findOrCreateFolder(drive, "shared-templates", accountInternalId);
    const companiesRootId = await findOrCreateFolder(
      drive,
      "companies",
      accountFolderId
    );

    // Step 3: account-master.gsheet
    const accountMasterSheetId = await findOrCreateSheet(
      drive,
      sheets,
      "account-master",
      accountInternalId,
      ACCOUNT_MASTER_TABS
    );

    // Step 4: Company folder + subfolders
    const slug = `WORKMANIS_${slugify(requisites.name)}`;
    const companyFolderId = await findOrCreateFolder(
      drive,
      slug,
      companiesRootId
    );
    for (const subPath of COMPANY_SUBFOLDERS) {
      await createFolderPath(drive, subPath, companyFolderId);
    }

    // Step 5: company.gsheet with 25 tabs
    const companySheetId = await findOrCreateSheet(
      drive,
      sheets,
      "company",
      companyFolderId,
      COMPANY_TABS.map((t) => ({ name: t.name, cols: [...t.cols] }))
    );

    // Step 6: Seed 01_requisites (only if empty)
    await seedRequisitesIfEmpty(sheets, companySheetId, requisites);

    // Step 7: Append row to account-master.gsheet/01_companies
    const accountMasterCompanyId = await appendCompanyToAccountMaster(
      sheets,
      accountMasterSheetId,
      {
        slug,
        name: requisites.name,
        legal_name: requisites.legal_name,
        reg_number: requisites.reg_number,
        folder_drive_id: companyFolderId,
        sheet_id: companySheetId,
        created_by: ctx.userEmail,
      }
    );

    return {
      slug,
      folderId: companyFolderId,
      sheetId: companySheetId,
      accountMasterCompanyId,
    };
  } catch (err) {
    throw new ProvisioningError(
      `Failed to provision company: ${requisites.name}`,
      err
    );
  }
}

// ============================================================
// Drive helpers (folder + sheet creation)
// ============================================================

/**
 * Find a folder by name within parent, or create one.
 * If parentId is null, searches/creates at the Drive root.
 */
async function findOrCreateFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId: string | null
): Promise<string> {
  const parentClause = parentId
    ? `'${parentId}' in parents`
    : `'root' in parents`;

  const query = [
    `name = '${escapeForQuery(name)}'`,
    parentClause,
    `mimeType = '${FOLDER_MIME}'`,
    `trashed = false`,
  ].join(" and ");

  const search = await drive.files.list({
    q: query,
    fields: "files(id)",
    pageSize: 1,
  });

  const existing = search.data.files?.[0];
  if (existing?.id) return existing.id;

  const created = await drive.files.create({
    requestBody: {
      name,
      parents: parentId ? [parentId] : undefined,
      mimeType: FOLDER_MIME,
    },
    fields: "id",
  });

  if (!created.data.id) {
    throw new Error(`Folder creation returned no ID: ${name}`);
  }
  return created.data.id;
}

/**
 * Create a slash-separated folder path under parent.
 * E.g. createFolderPath('contracts/employees', parentId) creates
 * both 'contracts' and 'employees' (nested) if missing.
 */
async function createFolderPath(
  drive: drive_v3.Drive,
  path: string,
  parentId: string
): Promise<string> {
  const parts = path.split("/").filter(Boolean);
  let current = parentId;
  for (const part of parts) {
    current = await findOrCreateFolder(drive, part, current);
  }
  return current;
}

/**
 * Find a spreadsheet by name within parent folder, or create one
 * with the given tab structure.
 */
async function findOrCreateSheet(
  drive: drive_v3.Drive,
  sheets: sheets_v4.Sheets,
  name: string,
  parentId: string,
  tabs: Array<{ name: string; cols: readonly string[] }>
): Promise<string> {
  // Search for existing
  const query = [
    `name = '${escapeForQuery(name)}'`,
    `'${parentId}' in parents`,
    `mimeType = '${SHEETS_MIME}'`,
    `trashed = false`,
  ].join(" and ");

  const search = await drive.files.list({
    q: query,
    fields: "files(id)",
    pageSize: 1,
  });

  let sheetId = search.data.files?.[0]?.id;

  if (!sheetId) {
    // Create new spreadsheet via Sheets API (gives us better tab control)
    const created = await sheets.spreadsheets.create({
      requestBody: { properties: { title: name } },
    });
    sheetId = created.data.spreadsheetId;
    if (!sheetId) throw new Error(`Sheet creation returned no ID: ${name}`);

    // Move the new spreadsheet from Drive root into the target folder
    await drive.files.update({
      fileId: sheetId,
      addParents: parentId,
      removeParents: "root",
      fields: "id, parents",
    });
  }

  // Ensure all tabs exist with correct headers (idempotent)
  await ensureTabsAndHeaders(sheets, sheetId, tabs);

  return sheetId;
}

// ============================================================
// Sheet tab management
// ============================================================

/**
 * Ensure every tab in `tabs` exists in the spreadsheet with the
 * right headers. Tabs that already exist are left alone (we don't
 * rewrite headers to avoid clobbering manual edits).
 */
async function ensureTabsAndHeaders(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabs: Array<{ name: string; cols: readonly string[] }>
): Promise<void> {
  // Read existing tab list
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  });
  const existingTabs = meta.data.sheets ?? [];
  const existingTitles = new Set(
    existingTabs.map((s) => s.properties?.title).filter(Boolean) as string[]
  );

  // Figure out which tabs need creating
  const tabsToCreate = tabs.filter((t) => !existingTitles.has(t.name));

  if (tabsToCreate.length > 0) {
    const requests: sheets_v4.Schema$Request[] = tabsToCreate.map((t) => ({
      addSheet: { properties: { title: t.name } },
    }));
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });
  }

  // Write headers to every tab (skipped if header row already matches)
  for (const tab of tabs) {
    await writeHeadersIfMissing(sheets, spreadsheetId, tab.name, tab.cols);
  }

  // Clean up: delete default "Sheet1" if it's the only empty one left
  const defaultSheet = existingTabs.find(
    (s) => s.properties?.title === "Sheet1"
  );
  if (defaultSheet?.properties?.sheetId !== undefined) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            { deleteSheet: { sheetId: defaultSheet.properties.sheetId } },
          ],
        },
      });
    } catch {
      // Already gone or can't delete — ignore
    }
  }
}

/**
 * Write headers to row 1 of a tab if it's empty. Also styles
 * the header row (bold, frozen, light gray bg).
 */
async function writeHeadersIfMissing(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabName: string,
  businessCols: readonly string[]
): Promise<void> {
  const allCols = [
    "id",
    "created_at",
    "updated_at",
    "deleted_at",
    ...businessCols,
  ];

  // Check if headers already present
  const current = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A1:${columnLetter(allCols.length)}1`,
  });
  const existing = current.data.values?.[0] ?? [];
  const matches =
    existing.length === allCols.length &&
    allCols.every((col, i) => existing[i] === col);
  if (matches) return;

  // Write headers
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A1:${columnLetter(allCols.length)}1`,
    valueInputOption: "RAW",
    requestBody: { values: [allCols] },
  });

  // Style the header row (bold + frozen + gray bg)
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  });
  const sheetProps = meta.data.sheets?.find(
    (s) => s.properties?.title === tabName
  )?.properties;
  if (!sheetProps?.sheetId) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId: sheetProps.sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
            },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.96, green: 0.96, blue: 0.96 },
                horizontalAlignment: "LEFT",
              },
            },
            fields:
              "userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)",
          },
        },
        {
          updateSheetProperties: {
            properties: {
              sheetId: sheetProps.sheetId,
              gridProperties: { frozenRowCount: 1 },
            },
            fields: "gridProperties.frozenRowCount",
          },
        },
      ],
    },
  });
}

// ============================================================
// Data seeding
// ============================================================

/**
 * Write the first row to 01_requisites from the form data.
 * Only if the tab currently has no data rows (idempotent).
 */
async function seedRequisitesIfEmpty(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  requisites: CompanyRequisites
): Promise<void> {
  // Check if 01_requisites already has a data row
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "01_requisites!A2:A2",
  });
  if (existing.data.values && existing.data.values.length > 0) return;

  const schema = COMPANY_TABS.find((t) => t.name === "01_requisites");
  if (!schema) throw new Error("01_requisites schema missing");

  const now = new Date().toISOString();
  const id = `req-${ddmmyy(new Date())}-1`;

  const allCols = [
    "id",
    "created_at",
    "updated_at",
    "deleted_at",
    ...schema.cols,
  ];

  const rowObj: Record<string, string> = {
    id,
    created_at: now,
    updated_at: now,
    deleted_at: "",
    name: requisites.name,
    legal_name: requisites.legal_name,
    reg_number: requisites.reg_number,
    vat_number: requisites.vat_number ?? "",
    address: requisites.address ?? "",
    iban: requisites.iban ?? "",
    bic: requisites.bic ?? "",
    phone: requisites.phone ?? "",
    email: requisites.email ?? "",
    website: requisites.website ?? "",
    logo_drive_id: "",
    director_name: requisites.director_name ?? "",
    director_position: requisites.director_position ?? "",
  };

  const values = [allCols.map((c) => rowObj[c] ?? "")];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "01_requisites!A:Z",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
}

/**
 * Append a row to account-master.gsheet/01_companies so the
 * new company shows up in the user's account registry.
 */
async function appendCompanyToAccountMaster(
  sheets: sheets_v4.Sheets,
  accountMasterSheetId: string,
  data: {
    slug: string;
    name: string;
    legal_name: string;
    reg_number: string;
    folder_drive_id: string;
    sheet_id: string;
    created_by: string;
  }
): Promise<string> {
  const now = new Date().toISOString();
  const id = `cmp-${ddmmyy(new Date())}-1`;

  // Check for existing row by slug (idempotent re-runs)
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: accountMasterSheetId,
    range: "01_companies!A:Z",
  });
  const rows = existing.data.values ?? [];
  const headerRow = rows[0] ?? [];
  const slugCol = headerRow.indexOf("slug");
  const idCol = headerRow.indexOf("id");
  if (slugCol >= 0 && idCol >= 0) {
    const existingRow = rows
      .slice(1)
      .find((r) => r[slugCol] === data.slug);
    if (existingRow) {
      return existingRow[idCol]; // Already registered
    }
  }

  const row = [
    id,
    now, // created_at
    now, // updated_at
    "", // deleted_at
    data.slug,
    data.name,
    data.legal_name,
    data.reg_number,
    data.folder_drive_id,
    data.sheet_id,
    "active", // status
    data.created_by,
    now, // last_activity_at
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: accountMasterSheetId,
    range: "01_companies!A:Z",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });

  return id;
}

// ============================================================
// Pure helpers
// ============================================================

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function ddmmyy(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}${mm}${yy}`;
}

function columnLetter(col: number): string {
  let result = "";
  while (col > 0) {
    const rem = (col - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    col = Math.floor((col - 1) / 26);
  }
  return result;
}

function escapeForQuery(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
