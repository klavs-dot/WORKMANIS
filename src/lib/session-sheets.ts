/**
 * Session-aware read access to a company's Sheet.
 *
 * Returns a Google Sheets API client + the company's sheet ID,
 * choosing authentication based on the calling user's session:
 *
 *   - Owner session: uses session.accessToken (existing
 *     getCompanyClients flow with per-company OAuth)
 *
 *   - External user session (accountant / warehouse_manager):
 *     uses the service account, looks up the company's sheet
 *     ID from the OWNER's 01_companies (read via service
 *     account too), and returns a Sheets client authenticated
 *     as the service account.
 *
 * Used by GET endpoints that read per-company sheets:
 *   /api/companies/requisites
 *   /api/payments (when implemented)
 *   /api/invoices, /api/clients, etc.
 *
 * NOT used for writes — external users are read-only for now.
 * Mutating endpoints should check session.role !== 'owner' and
 * return 403.
 *
 * Why a separate helper instead of patching getCompanyClients:
 *   - getCompanyClients tries to load per-company Gmail OAuth
 *     tokens from 04_company_oauth using the SESSION's token.
 *     For an external user there's no session token to walk
 *     Drive with.
 *   - Service account auth is JWT-based and stateless, doesn't
 *     need a refresh-token flow. Conceptually different enough
 *     to keep separate.
 */

import { google } from "googleapis";
import type { Session } from "next-auth";
import {
  getServiceAccountSheetsClient,
  getOwnerSheetId,
} from "./service-account";

export interface SessionSheetsContext {
  /** Authenticated Google Sheets API client */
  sheets: ReturnType<typeof google.sheets>;
  /** Spreadsheet ID for the target company */
  spreadsheetId: string;
  /** Owner's email — useful for caller logs */
  ownerEmail: string;
}

export class NoCompanyAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoCompanyAccessError";
  }
}

/**
 * Resolve a Sheets client + the per-company sheet ID for the
 * given companyId, choosing auth based on session role.
 *
 * For external users: looks up the owner's master sheet via
 * OWNER_SHEET_REGISTRY, reads 01_companies (via service account)
 * to find the matching companyId → sheet_id, then returns a
 * Sheets client authenticated as the service account against
 * that per-company sheet.
 *
 * For warehouse_manager: also verifies the companyId is in
 * session.allowedCompanyIds. Throws NoCompanyAccessError if not.
 *
 * For owner: returns null — caller should fall through to the
 * existing getCompanyClients() path (which has all the per-
 * company OAuth handling for Gmail-integration features).
 */
export async function getReadOnlySheetsForCompany(
  session: Session,
  companyId: string
): Promise<SessionSheetsContext | null> {
  const role = session.role ?? "owner";

  // Owner: caller should use the existing per-company OAuth flow.
  if (role === "owner") return null;

  const ownerEmail = (session.ownerEmail ?? "").trim().toLowerCase();
  if (!ownerEmail) {
    throw new NoCompanyAccessError(
      "Sesijā nav ownerEmail — login bija nepilnīgs"
    );
  }

  // Warehouse manager scope check
  if (role === "warehouse_manager") {
    const allowed = session.allowedCompanyIds ?? [];
    // Empty array = 'all companies'; non-empty = restricted list
    if (allowed.length > 0 && !allowed.includes(companyId)) {
      throw new NoCompanyAccessError(
        `Šim atbildīgajam nav piekļuves uzņēmumam ${companyId}`
      );
    }
  }

  const ownerSheetId = getOwnerSheetId(ownerEmail);
  if (!ownerSheetId) {
    throw new NoCompanyAccessError(
      `Uzņēmuma īpašnieks (${ownerEmail}) nav reģistrēts sistēmā`
    );
  }

  const sheets = await getServiceAccountSheetsClient();
  if (!sheets) {
    throw new NoCompanyAccessError(
      "Service account nav konfigurēts"
    );
  }

  // Read 01_companies from owner's master sheet to find this
  // company's per-company sheet ID
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: ownerSheetId,
    range: "01_companies!A:Z",
  });
  const rows = (res.data.values ?? []) as string[][];
  if (rows.length < 2) {
    throw new NoCompanyAccessError(
      "Uzņēmumu saraksts ir tukšs"
    );
  }
  const header = rows[0];
  const idCol = header.indexOf("id");
  const sheetIdCol = header.indexOf("sheet_id");
  const deletedCol = header.indexOf("deleted_at");
  if (idCol < 0 || sheetIdCol < 0) {
    throw new NoCompanyAccessError(
      "01_companies header nepilnīgs"
    );
  }

  const companyRow = rows.slice(1).find(
    (r) =>
      r[idCol] === companyId &&
      (deletedCol < 0 || !r[deletedCol])
  );
  if (!companyRow) {
    throw new NoCompanyAccessError(
      `Uzņēmums ${companyId} nav atrasts`
    );
  }

  const perCompanySheetId = companyRow[sheetIdCol];
  if (!perCompanySheetId) {
    throw new NoCompanyAccessError(
      `Uzņēmumam ${companyId} nav sheet_id`
    );
  }

  return {
    sheets,
    spreadsheetId: perCompanySheetId,
    ownerEmail,
  };
}
