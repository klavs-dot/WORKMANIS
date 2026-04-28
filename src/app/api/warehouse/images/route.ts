/**
 * Warehouse image upload endpoint.
 *
 * Receives multipart/form-data with a single 'file' field. Uploads
 * to the Workmanis_noliktava_attēli folder in Drive, returns a
 * publicly-readable URL the client can stuff into the inventory
 * item's imageUrl field.
 *
 * Limits:
 *   - 5 MB max (warehouse photos don't need print resolution)
 *   - JPEG, PNG, WebP, HEIC accepted (HEIC because iPhones)
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { uploadWarehouseImage } from "@/lib/warehouse-images";

export const maxDuration = 30;

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart form" },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB)` },
      { status: 413 }
    );
  }

  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: "Atļauti tikai attēli (JPEG, PNG, WebP, HEIC)" },
      { status: 415 }
    );
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Filename — strip path segments + sanitize. Add a short random
    // suffix so duplicate uploads don't overwrite each other in Drive.
    const original = file.name.replace(/^.*[\\/]/, "");
    const dot = original.lastIndexOf(".");
    const stem = dot > 0 ? original.slice(0, dot) : original;
    const ext = dot > 0 ? original.slice(dot) : "";
    const safe = stem.replace(/[^\w.-]+/g, "_").slice(0, 60);
    const random = Math.random().toString(36).slice(2, 8);
    const filename = `${safe}-${random}${ext}`;

    const result = await uploadWarehouseImage(
      session.accessToken,
      filename,
      file.type,
      buffer
    );

    return NextResponse.json({
      fileId: result.fileId,
      imageUrl: result.imageUrl,
    });
  } catch (err) {
    console.error("Image upload failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
