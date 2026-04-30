/**
 * POST /api/drive/upload
 *
 * Uploads a file to the company's Drive folder. Returns the new
 * Drive file ID — the caller saves that ID to the corresponding
 * Sheet row (e.g. invoice's file_drive_id column).
 *
 * Request: multipart/form-data with fields:
 *   file       — the binary file (PDF, image)
 *   sub_path   — folder path relative to company root, e.g.
 *                'invoices-out/2026/04'. Folders are created
 *                lazily if they don't exist.
 *
 * Query string:
 *   company_id — which company's Drive to upload into
 *
 * Response:
 *   { fileId, viewUrl, name, mimeType, size }
 *
 * Errors:
 *   - 401 if not authenticated
 *   - 400 if missing fields or file
 *   - 413 if file > 25 MB (sanity cap; invoices are typically <5 MB)
 *   - 502 on Drive API failure
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveCompany } from "@/lib/resolve-company";
import {
  createDriveClient,
  DriveError,
} from "@/lib/drive-client";

export const maxDuration = 60;

const MAX_UPLOAD_SIZE = 25 * 1024 * 1024;

export async function POST(request: Request) {
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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Nepareizs formas formāts" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Trūkst 'file' lauks" },
      { status: 400 }
    );
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    return NextResponse.json(
      {
        error: `Fails par lielu (${Math.round(file.size / 1024 / 1024)} MB). Maksimums: ${MAX_UPLOAD_SIZE / 1024 / 1024} MB.`,
      },
      { status: 413 }
    );
  }

  const subPathRaw = formData.get("sub_path");
  const subPath = typeof subPathRaw === "string" ? subPathRaw : "";

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
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await drive.uploadFile({
      subPath,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      content: buffer,
    });
    return NextResponse.json({
      fileId: result.fileId,
      viewUrl: result.viewUrl,
      name: file.name,
      mimeType: file.type,
      size: file.size,
    });
  } catch (err) {
    console.error("Drive upload failed:", err);
    if (err instanceof DriveError) {
      return NextResponse.json(
        { error: `Drive kļūda: ${err.message}` },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: "Augšupielāde neizdevās. Mēģiniet vēlreiz." },
      { status: 502 }
    );
  }
}
