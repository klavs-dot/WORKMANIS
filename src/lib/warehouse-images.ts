/**
 * Warehouse image storage.
 *
 * Uploads warehouse item photos to a single dedicated folder in the
 * user's Drive: 'Workmanis_noliktava_attēli'. The folder is created
 * lazily on first upload.
 *
 * Why a separate folder (not next to the Sheet, not under per-company
 * folders): warehouse data is global per the user's setup, and Drive
 * doesn't let us easily pin files 'next to' a Sheet — sheets and
 * folders are siblings, not parents. Cleanest is just a top-level
 * folder named after the data so the user can find it from Drive's
 * search if they ever need to.
 *
 * Files get publicly-readable permissions (anyone-with-link) so the
 * <img src> in the warehouse cards can render them without auth.
 * For an internal workshop tool this is fine — the URL is hard to
 * guess and the contents are mundane (tire photos, battery photos).
 * If the user needs private images later, swap to signed proxy URLs.
 */

import { google } from "googleapis";
import { Readable } from "stream";

const FOLDER_NAME = "Workmanis_noliktava_attēli";

interface UploadResult {
  /** Drive file ID — keep for later deletion if needed */
  fileId: string;
  /** Public direct-image URL — works as <img src> */
  imageUrl: string;
}

/**
 * Upload an image to the warehouse images folder.
 * Returns a public URL suitable for use as <img src>.
 */
export async function uploadWarehouseImage(
  accessToken: string,
  filename: string,
  mimeType: string,
  content: Buffer
): Promise<UploadResult> {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: "v3", auth: oauth2 });

  // Find or create the warehouse images folder. drive.file scope
  // only sees files we've created — fine for our own folder.
  const search = await drive.files.list({
    q: `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)",
    pageSize: 1,
  });

  let folderId = search.data.files?.[0]?.id;

  if (!folderId) {
    const created = await drive.files.create({
      requestBody: {
        name: FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
      },
      fields: "id",
    });
    folderId = created.data.id ?? undefined;
    if (!folderId) {
      throw new Error("Failed to create warehouse images folder");
    }
  }

  // Upload the file with the folder as parent
  const uploaded = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: bufferToReadable(content),
    },
    fields: "id",
  });

  const fileId = uploaded.data.id;
  if (!fileId) {
    throw new Error("Upload returned no file ID");
  }

  // Make the file publicly readable so <img src> works without auth.
  // 'anyone with link' rather than fully public — file IDs are 33
  // chars of high entropy, effectively unguessable.
  await drive.permissions.create({
    fileId,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  });

  // The /uc?export=view URL serves the file as direct image bytes
  // (with appropriate content-type). The /file/d/X/view URL serves
  // an HTML wrapper page, which is wrong for <img src>.
  const imageUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;

  return { fileId, imageUrl };
}

/**
 * Convert a Node Buffer to a Readable stream — googleapis v140+
 * expects a Readable, not a Buffer, for media uploads.
 */
function bufferToReadable(buf: Buffer): NodeJS.ReadableStream {
  return Readable.from(buf);
}
