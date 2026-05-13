/**
 * GET /api/owner-setup
 *
 * Returns information the owner needs to enable external user
 * logins:
 *   - Their email
 *   - Their account-master sheet ID
 *   - The service account email (if configured)
 *   - Current registration status
 *
 * Used by the Settings UI to show step-by-step setup instructions
 * with the actual values pre-filled — no manual copy-paste of
 * sheet IDs from URLs or guessing service account emails.
 *
 * Owner-only (requires Google OAuth session).
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { google } from "googleapis";
import {
  getServiceAccountEmail,
  getOwnerSheetId,
} from "@/lib/service-account";

const ROOT_FOLDER_NAME = "WORKMANIS";
const ACCOUNT_MASTER_NAME = "WORKMANIS_ACCOUNT_MASTER (DO NOT DELETE)";

async function findAccountMasterSheetId(
  drive: ReturnType<typeof google.drive>,
  userEmail: string
): Promise<string | null> {
  const folderMime = "application/vnd.google-apps.folder";
  const sheetMime = "application/vnd.google-apps.spreadsheet";

  const find = async (
    name: string,
    parentId: string | null,
    mime: string = folderMime
  ): Promise<string | null> => {
    const parentClause = parentId ? ` and '${parentId}' in parents` : "";
    const escaped = name.replace(/'/g, "\\'");
    const res = await drive.files.list({
      q: `name = '${escaped}' and mimeType = '${mime}'${parentClause} and trashed = false`,
      fields: "files(id)",
      spaces: "drive",
    });
    return res.data.files?.[0]?.id ?? null;
  };

  const root = await find(ROOT_FOLDER_NAME, null);
  if (!root) return null;
  const accounts = await find("accounts", root);
  if (!accounts) return null;
  const userFolder = await find(userEmail, accounts);
  if (!userFolder) return null;
  const acct = await find("_account", userFolder);
  if (!acct) return null;
  return await find(ACCOUNT_MASTER_NAME, acct, sheetMime);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  // Only owners can use this — external users wouldn't have
  // Drive access to find their sheet anyway
  if (session.role !== "owner") {
    return NextResponse.json(
      { error: "Only the owner can access setup info" },
      { status: 403 }
    );
  }

  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: session.accessToken });
  const drive = google.drive({ version: "v3", auth: oauth2 });

  const sheetId = await findAccountMasterSheetId(drive, session.user.email);
  const serviceAccountEmail = getServiceAccountEmail();
  const registeredSheetId = getOwnerSheetId(session.user.email);

  // Status:
  //   'ready' — service account configured + sheet registered
  //   'needs-share' — service account configured but sheet not
  //                   yet shared with it (registry has the sheet
  //                   ID, but it hasn't been linked)
  //   'needs-env-var' — sheet found via Drive walk but not in
  //                     OWNER_SHEET_REGISTRY env yet
  //   'no-service-account' — GOOGLE_SERVICE_ACCOUNT_KEY not set
  //   'no-sheet' — folder walk didn't find account-master sheet
  let status: string;
  if (!serviceAccountEmail) {
    status = "no-service-account";
  } else if (!sheetId) {
    status = "no-sheet";
  } else if (registeredSheetId === sheetId) {
    status = "ready";
  } else {
    status = "needs-env-var";
  }

  return NextResponse.json({
    ownerEmail: session.user.email,
    sheetId: sheetId ?? null,
    serviceAccountEmail: serviceAccountEmail ?? null,
    registeredSheetId: registeredSheetId ?? null,
    status,
  });
}
