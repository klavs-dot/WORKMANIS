/**
 * Drive API client — server-side only.
 *
 * Manages file uploads into the per-company Drive folder hierarchy.
 * Companion to sheets-client.ts: where Sheets stores structured data,
 * Drive stores binary files (PDFs, images, exported XML, etc.).
 *
 * Key features:
 *   - Lazy folder creation: invoices-out/2026/04/ is only created
 *     when the first April 2026 invoice PDF is actually uploaded
 *   - Idempotent folder lookups: same path → same folder ID
 *   - File metadata indexed in 50_documents tab via SheetsClient
 *     (caller must wire this — Drive client doesn't know about Sheets)
 *   - Pre-signed URLs for downloads (alpha-bypass for browser fetch)
 *
 * NOT browser-safe — uses 'googleapis' which is node-only. Always
 * import from server code (API routes, server actions) only.
 *
 * Usage (from a Next.js API route):
 *
 *   import { auth } from '@/auth';
 *   import { createDriveClient } from '@/lib/drive-client';
 *
 *   const session = await auth();
 *   const drive = createDriveClient({
 *     accessToken: session.accessToken,
 *     companyFolderId: company.folder_drive_id,
 *   });
 *
 *   const { fileId, viewUrl } = await drive.uploadFile({
 *     subPath: 'invoices-out/2026/04',
 *     filename: 'inv-190426-1.pdf',
 *     mimeType: 'application/pdf',
 *     content: pdfBuffer,
 *   });
 */

import { google, type drive_v3 } from "googleapis";
import { Readable } from "stream";

// ============================================================
// Types
// ============================================================

export interface DriveClientConfig {
  /** OAuth access token from the authenticated user's session */
  accessToken: string;
  /**
   * Drive file ID of the company root folder
   * (e.g. WORKMANIS_GLOBAL_WOLF_MOTORS). All paths are resolved
   * relative to this folder.
   */
  companyFolderId: string;
}

export interface UploadFileInput {
  /**
   * Folder path relative to the company root. Slash-separated.
   * Folders are created lazily if they don't exist.
   * Example: 'invoices-out/2026/04'
   */
  subPath: string;
  /** Filename including extension. Should be ASCII kebab-case. */
  filename: string;
  /** MIME type (e.g. 'application/pdf', 'image/png') */
  mimeType: string;
  /** Binary content as Buffer or Uint8Array */
  content: Buffer | Uint8Array;
}

export interface UploadFileResult {
  /** Drive file ID — store this in the corresponding sheet row */
  fileId: string;
  /** Drive web view URL — opens in browser viewer */
  viewUrl: string;
  /** Drive download URL — direct file download */
  downloadUrl: string;
}

export class DriveError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "DriveError";
  }
}

// ============================================================
// Client factory
// ============================================================

export function createDriveClient(config: DriveClientConfig) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: config.accessToken });
  const drive = google.drive({ version: "v3", auth: oauth2Client });

  return new DriveClient(drive, config);
}

// ============================================================
// Client implementation
// ============================================================

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

export class DriveClient {
  /**
   * Folder ID cache. Path → file ID. Avoids repeated lookups for
   * paths like 'invoices-out/2026/04' that get hit many times in
   * a row when bulk-uploading.
   *
   * Cache lives for the life of this client instance (one per
   * API request), so it never goes stale within a request.
   */
  private folderCache = new Map<string, string>();

  constructor(
    private readonly drive: drive_v3.Drive,
    private readonly config: DriveClientConfig
  ) {}

  /**
   * Upload a file into a sub-path under the company folder.
   * Creates intermediate folders as needed (lazy).
   */
  async uploadFile(input: UploadFileInput): Promise<UploadFileResult> {
    const folderId = await this.ensureFolderPath(input.subPath);

    try {
      const response = await this.drive.files.create({
        requestBody: {
          name: input.filename,
          parents: [folderId],
          mimeType: input.mimeType,
        },
        media: {
          mimeType: input.mimeType,
          body: bufferToStream(input.content),
        },
        fields: "id,webViewLink,webContentLink",
      });

      const fileId = response.data.id;
      if (!fileId) {
        throw new DriveError(
          "Drive returned no file ID after upload — this should be impossible"
        );
      }

      return {
        fileId,
        viewUrl: response.data.webViewLink ?? this.buildViewUrl(fileId),
        downloadUrl:
          response.data.webContentLink ?? this.buildDownloadUrl(fileId),
      };
    } catch (err) {
      throw new DriveError(`Upload failed: ${input.filename}`, err);
    }
  }

  /**
   * Download a file's binary content by ID. Returns null if not found
   * or access denied (drive.file scope only sees WORKMANIS files).
   */
  async downloadFile(fileId: string): Promise<Buffer | null> {
    try {
      const response = await this.drive.files.get(
        { fileId, alt: "media" },
        { responseType: "arraybuffer" }
      );
      return Buffer.from(response.data as ArrayBuffer);
    } catch (err) {
      const code = (err as { code?: number })?.code;
      if (code === 404 || code === 403) return null;
      throw new DriveError(`Download failed: ${fileId}`, err);
    }
  }

  /**
   * Get file metadata without downloading content. Useful for
   * checking existence and getting the latest webViewLink.
   */
  async getFileMetadata(fileId: string): Promise<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
    createdTime: string;
    modifiedTime: string;
    viewUrl: string;
  } | null> {
    try {
      const response = await this.drive.files.get({
        fileId,
        fields: "id,name,mimeType,size,createdTime,modifiedTime,webViewLink",
      });
      const d = response.data;
      if (!d.id) return null;
      return {
        id: d.id,
        name: d.name ?? "",
        mimeType: d.mimeType ?? "",
        size: parseInt(d.size ?? "0", 10),
        createdTime: d.createdTime ?? "",
        modifiedTime: d.modifiedTime ?? "",
        viewUrl: d.webViewLink ?? this.buildViewUrl(d.id),
      };
    } catch (err) {
      const code = (err as { code?: number })?.code;
      if (code === 404 || code === 403) return null;
      throw new DriveError(`Get metadata failed: ${fileId}`, err);
    }
  }

  /**
   * Move a file to the trash. Drive's standard "delete" — file is
   * recoverable for 30 days from the user's Drive trash before
   * permanent deletion.
   *
   * We never call files.delete() (permanent) directly — soft trash
   * matches our soft-delete pattern in Sheets.
   */
  async trashFile(fileId: string): Promise<void> {
    try {
      await this.drive.files.update({
        fileId,
        requestBody: { trashed: true },
      });
    } catch (err) {
      throw new DriveError(`Trash failed: ${fileId}`, err);
    }
  }

  /**
   * Restore a previously trashed file.
   */
  async untrashFile(fileId: string): Promise<void> {
    try {
      await this.drive.files.update({
        fileId,
        requestBody: { trashed: false },
      });
    } catch (err) {
      throw new DriveError(`Untrash failed: ${fileId}`, err);
    }
  }

  /**
   * Resolve a slash-separated path under the company folder to a
   * folder ID. Creates folders as needed. Cached per-client-instance.
   *
   * Example: ensureFolderPath('invoices-out/2026/04')
   *   → looks up 'invoices-out' under company root, creates if missing
   *   → looks up '2026' under that, creates if missing
   *   → looks up '04' under that, creates if missing
   *   → returns the final folder's ID
   */
  async ensureFolderPath(subPath: string): Promise<string> {
    if (this.folderCache.has(subPath)) {
      return this.folderCache.get(subPath)!;
    }

    const parts = subPath.split("/").filter(Boolean);
    let currentParent = this.config.companyFolderId;

    for (let i = 0; i < parts.length; i++) {
      const partialPath = parts.slice(0, i + 1).join("/");

      // Check cache for the partial path too — saves API calls when
      // multiple uploads share a prefix
      if (this.folderCache.has(partialPath)) {
        currentParent = this.folderCache.get(partialPath)!;
        continue;
      }

      currentParent = await this.findOrCreateFolder(parts[i], currentParent);
      this.folderCache.set(partialPath, currentParent);
    }

    return currentParent;
  }

  // ============================================================
  // Internal helpers
  // ============================================================

  /**
   * Find a child folder by name within parent, or create one.
   * Idempotent — running twice returns the same folder ID.
   *
   * Uses a Drive API search query with parent + name + mime constraint.
   * If multiple folders share the name (shouldn't happen with our
   * naming, but Drive allows it), returns the first match.
   */
  private async findOrCreateFolder(
    name: string,
    parentId: string
  ): Promise<string> {
    // Drive query: name match + parent + folder mime + not trashed
    const query = [
      `name = '${escapeForQuery(name)}'`,
      `'${parentId}' in parents`,
      `mimeType = '${FOLDER_MIME_TYPE}'`,
      `trashed = false`,
    ].join(" and ");

    try {
      const search = await this.drive.files.list({
        q: query,
        fields: "files(id)",
        pageSize: 1,
      });

      const existing = search.data.files?.[0];
      if (existing?.id) return existing.id;

      // Not found — create
      const created = await this.drive.files.create({
        requestBody: {
          name,
          parents: [parentId],
          mimeType: FOLDER_MIME_TYPE,
        },
        fields: "id",
      });

      if (!created.data.id) {
        throw new DriveError(`Folder creation returned no ID: ${name}`);
      }
      return created.data.id;
    } catch (err) {
      throw new DriveError(`findOrCreateFolder failed: ${name}`, err);
    }
  }

  private buildViewUrl(fileId: string): string {
    return `https://drive.google.com/file/d/${fileId}/view`;
  }

  private buildDownloadUrl(fileId: string): string {
    return `https://drive.google.com/uc?id=${fileId}&export=download`;
  }
}

// ============================================================
// Pure helpers
// ============================================================

/**
 * Convert a Buffer or Uint8Array into a Node Readable stream.
 * googleapis 'media.body' requires a stream interface, not raw bytes.
 */
function bufferToStream(buf: Buffer | Uint8Array): Readable {
  const stream = new Readable();
  stream._read = () => {}; // no-op required by Readable interface
  stream.push(buf);
  stream.push(null); // EOF
  return stream;
}

/**
 * Escape a string for safe inclusion in a Drive API query.
 * Drive uses single quotes for string literals, so apostrophes
 * must be escaped. Backslashes also need escaping.
 */
function escapeForQuery(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
