/**
 * DELETE /api/companies/delete?company_id=X&keep_drive=true|false
 *
 * Permanently removes a company from WORKMANIS:
 *
 *   1. (Conditional) If keep_drive=false (default):
 *      Move the company's Drive folder (and ALL its contents —
 *      invoices, statements, logos, the company.gsheet itself)
 *      to Drive Trash. The user can manually restore it from
 *      drive.google.com if they change their mind, until they
 *      empty the trash. After 30 days Google auto-purges.
 *
 *      If keep_drive=true:
 *      Drive folder is NOT touched. All files stay where they
 *      are. This lets users "unregister" a company from
 *      WORKMANIS without losing the underlying data — useful
 *      for archiving, switching to a different tool while
 *      keeping the documents accessible, or testing.
 *
 *   2. Delete the row from account-master.gsheet/01_companies.
 *      We do a HARD delete here (not soft) because the company
 *      is gone from WORKMANIS — there's no scenario where a
 *      soft-deleted entry would still be useful, and leaving it
 *      would mean the sidebar / dropdown would have to filter
 *      on deleted_at.
 *
 *   3. Invalidate the resolveCompany cache for this user so the
 *      next request doesn't return stale data.
 *
 * Why "unregister but keep Drive" is useful:
 *   - User wants a clean WORKMANIS but isn't ready to delete
 *     years of historical invoice PDFs
 *   - User is migrating to a new accountant tool that will
 *     read those same Drive files
 *   - User accidentally created a duplicate company entry in
 *     WORKMANIS and wants to remove the duplicate without
 *     touching the underlying data
 *   - User wants to "park" a company they're not using right
 *     now (e.g. seasonal business) — re-add later by creating
 *     a new entry; the existing folder/sheet will be reused.
 *
 * Why move-to-trash vs permanent delete (when keep_drive=false):
 *   - Google Drive's trash is a built-in 30-day safety net.
 *     Permanent delete (drive.files.delete) is unrecoverable.
 *     Trash is recoverable by the user from drive.google.com.
 *   - We don't need WORKMANIS to know about the trash window —
 *     Google handles auto-purge. This means a panicked user can
 *     restore mid-30-days by themselves without contacting us.
 *
 * Why hard-delete the master row (regardless of keep_drive):
 *   - The master row is just a registry pointer. Removing it is
 *     what "removes from WORKMANIS" actually means.
 *   - Even if Drive folder still exists, the master row pointed
 *     at it is gone. Re-adding the company creates a new master
 *     row that points to the same (or a fresh) folder.
 *
 * Auth: only the user who owns the company can delete it.
 * resolveCompany() guarantees this — it walks
 * /WORKMANIS/accounts/{userEmail}/_account/account-master,
 * so a different user's session can't see a different account's
 * company.
 *
 * Errors:
 *   401 — not authenticated
 *   400 — missing company_id
 *   404 — company not found in user's registry
 *   502 — Google API failure (Drive or Sheets)
 */

import { NextResponse } from "next/server";
import { google } from "googleapis";
import { auth } from "@/auth";
import { resolveCompany } from "@/lib/resolve-company";
import { withRetry } from "@/lib/sheets-client";
import {
  getCompanyClients,
  NoCompanyOAuthError,
} from "@/lib/company-clients";
import { deleteCompanyOAuth } from "@/lib/company-oauth-store";

// Drive trash + master row delete is fast — usually under 5s.
// 30s is generous headroom in case Drive trash takes longer for
// folders with many nested files (the trash op cascades to
// children automatically, but propagation can take a moment).
export const maxDuration = 30;

const ROOT_FOLDER_NAME = "WORKMANIS";
const ACCOUNT_MASTER_NAME = "WORKMANIS_ACCOUNT_MASTER (DO NOT DELETE)";

export async function DELETE(request: Request) {
  // Wrap everything in try/catch so any failure (auth, Drive
  // throttling, Sheets throttling) becomes a proper JSON error
  // response. Without this the client sees a Vercel-generated
  // empty 500 and "Unexpected end of JSON input".
  try {
    const session = await auth();
    if (!session?.user?.email || !session.accessToken) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const companyId = url.searchParams.get("company_id");
    if (!companyId) {
      return NextResponse.json(
        { error: "Missing company_id" },
        { status: 400 }
      );
    }

    // Default: trash the Drive folder. Pass ?keep_drive=true to
    // unregister from WORKMANIS but leave Drive contents intact.
    // Strict comparison — anything other than 'true' (lowercase)
    // is treated as false to avoid accidental data preservation
    // when the user really meant to delete everything.
    const keepDrive = url.searchParams.get("keep_drive") === "true";

    const company = await resolveCompany(
      session.accessToken,
      session.user.email,
      companyId
    );
    if (!company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    const oauth2 = new google.auth.OAuth2();
    oauth2.setCredentials({ access_token: session.accessToken });
    const drive = google.drive({ version: "v3", auth: oauth2 });
    const sheets = google.sheets({ version: "v4", auth: oauth2 });

    // ───── Step 1 (conditional): trash the Drive folder ─────
    // Skipped entirely when keep_drive=true. The folder + all
    // its contents stay exactly where they are; only the
    // WORKMANIS registry pointer is removed.
    //
    // CRITICAL: we use the COMPANY's Drive client here, not the
    // login user's. The company folder lives in the connected
    // Gmail's Drive, which may be different from the login user's
    // Drive. Without per-company OAuth we'd get a 404 trying to
    // trash a folder we don't own from the session perspective.
    if (!keepDrive) {
      try {
        // Try per-company OAuth first — this works when company
        // has a Gmail connected (the normal case)
        let companyDrive;
        try {
          const cc = await getCompanyClients(companyId);
          companyDrive = cc.drive;
        } catch (oauthErr) {
          if (oauthErr instanceof NoCompanyOAuthError) {
            // No Gmail connected — fall back to session client.
            // This handles edge case: orphan companies (created
            // before OAuth flow, or where token save failed).
            // If the folder is in user's own Drive, this works.
            // If it's in someone else's Drive, the trash will 404
            // and we'll catch it below.
            console.warn(
              `[delete-company] No OAuth for ${companyId}, using session token`
            );
            companyDrive = drive;
          } else {
            throw oauthErr;
          }
        }

        await withRetry(
          () =>
            companyDrive.files.update({
              fileId: company.folderId,
              requestBody: { trashed: true },
              supportsAllDrives: true,
            }),
          `trash folder(${company.folderId})`
        );
      } catch (err) {
        // If the folder is already trashed or doesn't exist, that's
        // fine — proceed to clean up the master row.
        const msg = err instanceof Error ? err.message : "";
        const code =
          err && typeof err === "object" && "code" in err
            ? (err as { code: number | string }).code
            : null;
        if (code === 404 || /not found/i.test(msg)) {
          console.warn(
            `Folder ${company.folderId} already gone, continuing with master cleanup`
          );
        } else {
          throw err;
        }
      }
    } else {
      console.log(
        `[delete-company] keep_drive=true; preserving Drive folder ${company.folderId} for ${company.name}`
      );
    }

    // ───── Step 2: find the account-master sheet ─────
    // We need its ID to delete the company's row from
    // 01_companies. Walk Drive tree:
    //   WORKMANIS / accounts / {email} / _account / WORKMANIS_ACCOUNT_MASTER
    const accountMasterId = await findAccountMasterSheet(
      drive,
      session.user.email
    );
    if (!accountMasterId) {
      // Master sheet missing — nothing to delete. Folder is
      // already trashed (if keep_drive=false), so the cleanup
      // is effectively done from the user's perspective.
      return NextResponse.json({
        ok: true,
        message: keepDrive
          ? `${company.name} dzēsts no WORKMANIS. Drive mape saglabāta.`
          : `${company.name} dzēsts (account-master nav atrasts, bet Drive mape pārvietota uz miskasti)`,
      });
    }

    // ───── Step 3: hard-delete the master row ─────
    // Find the row index of this company's entry in 01_companies
    // and remove that row. We use deleteDimension (batchUpdate)
    // which physically removes the row rather than blanking it,
    // so the registry stays clean.
    await deleteCompanyRowFromMaster(
      sheets,
      accountMasterId,
      company.companyId
    );

    // ───── Step 4: soft-delete the OAuth row ─────
    // Mark the company's 04_company_oauth row(s) as deleted so
    // future getCompanyClients(id) calls return NoCompanyOAuth
    // rather than trying to use stale tokens. This is a separate
    // step from the hard-delete above because OAuth rows are
    // soft-deleted (audit trail) while company registry rows are
    // hard-deleted (clean state).
    //
    // Best-effort: if this fails the company is already gone from
    // WORKMANIS, the orphan OAuth row is harmless (no company id
    // matches it anymore).
    try {
      await deleteCompanyOAuth({
        userAccessToken: session.accessToken,
        userEmail: session.user.email,
        companyId: company.companyId,
      });
    } catch (err) {
      console.warn(
        `[delete-company] OAuth row cleanup failed for ${company.companyId}:`,
        err
      );
    }

    return NextResponse.json({
      ok: true,
      message: keepDrive
        ? `${company.name} dzēsts no WORKMANIS. Drive mape saglabāta — pieejama tava Drive.`
        : `${company.name} dzēsts no WORKMANIS un Drive mape pārvietota uz miskasti.`,
    });
  } catch (err) {
    console.error("Delete company failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Dzēšana neizdevās: ${err.message}`
            : "Dzēšana neizdevās",
      },
      { status: 502 }
    );
  }
}

/**
 * Walk Drive to find this user's account-master sheet ID.
 * Returns null if any step in the tree is missing.
 *
 * This duplicates a piece of logic from resolveCompany, but
 * we don't want to refactor resolveCompany right now to expose
 * the internal IDs — that would change a hot path. A 5-call
 * walk for delete (rare operation) is acceptable.
 */
async function findAccountMasterSheet(
  drive: ReturnType<typeof google.drive>,
  userEmail: string
): Promise<string | null> {
  const folderMime = "application/vnd.google-apps.folder";
  const sheetMime = "application/vnd.google-apps.spreadsheet";

  // WORKMANIS root
  const rootRes = await withRetry(
    () =>
      drive.files.list({
        q: `name = '${ROOT_FOLDER_NAME}' and mimeType = '${folderMime}' and trashed = false`,
        fields: "files(id)",
        spaces: "drive",
      }),
    "find WORKMANIS root"
  );
  const rootId = rootRes.data.files?.[0]?.id;
  if (!rootId) return null;

  // accounts
  const accountsRes = await withRetry(
    () =>
      drive.files.list({
        q: `name = 'accounts' and mimeType = '${folderMime}' and '${rootId}' in parents and trashed = false`,
        fields: "files(id)",
        spaces: "drive",
      }),
    "find accounts"
  );
  const accountsId = accountsRes.data.files?.[0]?.id;
  if (!accountsId) return null;

  // {email}
  const userRes = await withRetry(
    () =>
      drive.files.list({
        q: `name = '${userEmail.replace(/'/g, "\\'")}' and mimeType = '${folderMime}' and '${accountsId}' in parents and trashed = false`,
        fields: "files(id)",
        spaces: "drive",
      }),
    "find user folder"
  );
  const userId = userRes.data.files?.[0]?.id;
  if (!userId) return null;

  // _account
  const acctRes = await withRetry(
    () =>
      drive.files.list({
        q: `name = '_account' and mimeType = '${folderMime}' and '${userId}' in parents and trashed = false`,
        fields: "files(id)",
        spaces: "drive",
      }),
    "find _account"
  );
  const acctId = acctRes.data.files?.[0]?.id;
  if (!acctId) return null;

  // master sheet
  const masterRes = await withRetry(
    () =>
      drive.files.list({
        q: `name = '${ACCOUNT_MASTER_NAME.replace(/'/g, "\\'")}' and mimeType = '${sheetMime}' and '${acctId}' in parents and trashed = false`,
        fields: "files(id)",
        spaces: "drive",
      }),
    "find account-master"
  );
  return masterRes.data.files?.[0]?.id ?? null;
}

/**
 * Physically remove the company's row from
 * account-master.gsheet/01_companies. We need the row's index
 * within the sheet to pass to deleteDimension.
 *
 * Reads the whole tab, finds the row by id, and issues a
 * batchUpdate with deleteDimension. If multiple rows exist with
 * the same id (shouldn't happen, but defensive), removes only
 * the first match.
 *
 * If the row isn't found, we silently succeed — the user's
 * intent (remove this company) is already satisfied.
 */
async function deleteCompanyRowFromMaster(
  sheets: ReturnType<typeof google.sheets>,
  masterSheetId: string,
  companyId: string
): Promise<void> {
  // Read the full tab so we know which row to delete
  const valuesRes = await withRetry(
    () =>
      sheets.spreadsheets.values.get({
        spreadsheetId: masterSheetId,
        range: "01_companies!A:Z",
      }),
    "read 01_companies"
  );
  const rows = valuesRes.data.values ?? [];
  if (rows.length < 2) return;

  const header = rows[0] as string[];
  const idCol = header.indexOf("id");
  if (idCol < 0) {
    throw new Error("01_companies has no 'id' column — schema mismatch");
  }

  // 0-indexed within the data rows. +1 because header is row 1
  // (1-indexed for Sheets API), so data row N is sheet row N+2.
  // Actually deleteDimension uses 0-indexed startIndex/endIndex
  // so data row N (0-indexed in our slice) = sheet startIndex N+1.
  let dataRowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idCol] === companyId) {
      dataRowIndex = i; // sheet 0-indexed row number
      break;
    }
  }
  if (dataRowIndex < 0) {
    console.warn(
      `Company ${companyId} not found in master 01_companies; nothing to delete`
    );
    return;
  }

  // Look up the numeric sheetId of the 01_companies tab — needed
  // for deleteDimension which works in tab IDs, not names.
  const metaRes = await withRetry(
    () =>
      sheets.spreadsheets.get({
        spreadsheetId: masterSheetId,
        fields: "sheets.properties(sheetId,title)",
      }),
    "get sheet metadata"
  );
  const tab = (metaRes.data.sheets ?? []).find(
    (s) => s.properties?.title === "01_companies"
  );
  const tabId = tab?.properties?.sheetId;
  if (tabId === undefined || tabId === null) {
    throw new Error("01_companies tab not found in master sheet");
  }

  await withRetry(
    () =>
      sheets.spreadsheets.batchUpdate({
        spreadsheetId: masterSheetId,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId: tabId,
                  dimension: "ROWS",
                  startIndex: dataRowIndex,
                  endIndex: dataRowIndex + 1,
                },
              },
            },
          ],
        },
      }),
    "delete master row"
  );
}
