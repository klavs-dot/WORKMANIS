/**
 * GET /api/owner-info
 *
 * Returns the current owner's email and account-master sheet ID
 * so they can register it in OWNER_SHEET_REGISTRY env variable
 * during service account setup.
 *
 * Owner-only (uses session.accessToken to walk Drive).
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { google } from "googleapis";

const ROOT_FOLDER_NAME = "WORKMANIS";
const ACCOUNT_MASTER_NAME = "WORKMANIS_ACCOUNT_MASTER (DO NOT DELETE)";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  try {
    const oauth2 = new google.auth.OAuth2();
    oauth2.setCredentials({ access_token: session.accessToken });
    const drive = google.drive({ version: "v3", auth: oauth2 });

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
      });
      return res.data.files?.[0]?.id ?? null;
    };

    const root = await find(ROOT_FOLDER_NAME, null);
    if (!root) return NextResponse.json({ error: "WORKMANIS folder not found" }, { status: 404 });
    const accounts = await find("accounts", root);
    if (!accounts) return NextResponse.json({ error: "accounts folder not found" }, { status: 404 });
    const userFolder = await find(session.user.email, accounts);
    if (!userFolder) return NextResponse.json({ error: "user folder not found" }, { status: 404 });
    const acct = await find("_account", userFolder);
    if (!acct) return NextResponse.json({ error: "_account folder not found" }, { status: 404 });
    const masterSheetId = await find(ACCOUNT_MASTER_NAME, acct, sheetMime);
    if (!masterSheetId) {
      return NextResponse.json(
        { error: "WORKMANIS_ACCOUNT_MASTER not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ownerEmail: session.user.email,
      masterSheetId,
      registryJson: JSON.stringify({
        [session.user.email.toLowerCase()]: masterSheetId,
      }),
    });
  } catch (err) {
    console.error("Failed to find master sheet:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
