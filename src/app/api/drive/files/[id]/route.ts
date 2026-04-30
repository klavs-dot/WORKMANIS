/**
 * GET /api/drive/files/[id]
 *
 * Streams a Drive file's content to the browser. Two modes:
 *   - default → 'attachment' (browser downloads, original filename)
 *   - ?mode=view → 'inline' (browser displays in tab/iframe; for PDFs)
 *
 * Authentication: requires a logged-in session. The user's OAuth
 * token is used for the Drive call, so they can only fetch files
 * they have access to under WORKMANIS scope.
 *
 * Why this proxy exists instead of using webViewLink directly:
 *   1. webViewLink redirects to drive.google.com which prompts the
 *      user with Google's own UI (preview frame, sign-in if needed).
 *      We want a clean download/view-in-place experience inside the
 *      app.
 *   2. drive.file scope means files are owned by the user's account,
 *      but webViewLink still requires a Google session — the proxy
 *      avoids that round-trip by using the access token server-side.
 *   3. We can set Content-Disposition for proper filename on download.
 *
 * Caching: deliberately not cached. Files are typically small (<5 MB
 * invoice PDFs), and stale-cache risk on a financial document is
 * higher than the bandwidth cost.
 *
 * Errors:
 *   - 401 if not authenticated
 *   - 400 if missing company_id
 *   - 404 if file doesn't exist or user can't access it
 *   - 502 on Drive API failures
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveCompany } from "@/lib/resolve-company";
import {
  createDriveClient,
  DriveError,
} from "@/lib/drive-client";

export const maxDuration = 30;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  const { id: fileId } = await params;
  if (!fileId) {
    return NextResponse.json({ error: "Missing file id" }, { status: 400 });
  }

  const url = new URL(request.url);
  const companyId = url.searchParams.get("company_id");
  if (!companyId) {
    return NextResponse.json(
      { error: "Missing company_id" },
      { status: 400 }
    );
  }

  // 'view' mode = inline display (PDF in browser tab/iframe);
  // anything else = attachment (download dialog with filename).
  const mode = url.searchParams.get("mode") === "view" ? "view" : "download";

  const company = await resolveCompany(
    session.accessToken,
    session.user.email,
    companyId
  );
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const drive = createDriveClient({
    accessToken: session.accessToken,
    companyFolderId: company.folderId,
  });

  try {
    // Fetch metadata first so we can set the filename + mime type.
    // If this fails the download will too, so it's not extra cost.
    const meta = await drive.getFileMetadata(fileId);
    if (!meta) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const buffer = await drive.downloadFile(fileId);
    if (!buffer) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Build the response. ASCII-safe filename via filename* RFC 5987
    // syntax handles non-Latin characters (Latvian diacritics, etc.)
    // without breaking older browsers.
    const safeName = meta.name.replace(/"/g, "");
    const encodedName = encodeURIComponent(meta.name);
    const disposition =
      mode === "view"
        ? `inline; filename="${safeName}"; filename*=UTF-8''${encodedName}`
        : `attachment; filename="${safeName}"; filename*=UTF-8''${encodedName}`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": meta.mimeType || "application/octet-stream",
        "Content-Disposition": disposition,
        "Content-Length": String(buffer.length),
        // No-cache because financial documents can be replaced/updated
        // and a stale download could cause real-world confusion
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error(`Drive download failed for ${fileId}:`, err);
    if (err instanceof DriveError) {
      return NextResponse.json(
        { error: `Drive kļūda: ${err.message}` },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: "Drive kļūda. Mēģiniet vēlreiz." },
      { status: 502 }
    );
  }
}
