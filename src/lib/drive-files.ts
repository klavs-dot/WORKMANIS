/**
 * Client-side helpers for working with Drive files via the
 * /api/drive endpoints. Two paths:
 *
 *   uploadFileToDrive — POST a file, get back a Drive file ID
 *                        that the caller saves to the relevant
 *                        Sheet row (e.g. invoice's file_drive_id)
 *
 *   buildDriveFileUrl  — build a URL pointing at the proxy that
 *                        serves the file. Use for both download
 *                        and inline view (PDFs in browser tab).
 *
 * These avoid leaking the Drive client/SDK to the browser bundle —
 * googleapis is server-only.
 */

export interface UploadResult {
  fileId: string;
  viewUrl: string;
  name: string;
  mimeType: string;
  size: number;
}

/**
 * Upload a file to the company's Drive folder.
 *
 * @param file       The browser File object to upload
 * @param subPath    Folder path under company root, e.g.
 *                   'invoices-in/2026/04'. The folder is created
 *                   on the server if it doesn't exist yet.
 * @param companyId  Active company ID (used to resolve which
 *                   Drive folder to upload into)
 *
 * Throws Error with a Latvian-language message on failure so the
 * caller can surface it via toast directly.
 */
export async function uploadFileToDrive(
  file: File,
  subPath: string,
  companyId: string
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("sub_path", subPath);

  const res = await fetch(
    `/api/drive/upload?company_id=${encodeURIComponent(companyId)}`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!res.ok) {
    const errBody = await res
      .json()
      .catch(() => ({ error: `HTTP ${res.status}` }));
    const message =
      typeof errBody?.error === "string"
        ? errBody.error
        : `Augšupielāde neizdevās (${res.status})`;
    throw new Error(message);
  }

  return (await res.json()) as UploadResult;
}

/**
 * Build a URL that streams a Drive file's contents through our
 * server-side proxy. Use directly in window.open() or as the href
 * on a download link / iframe src.
 *
 * @param fileId    Drive file ID stored in the Sheet
 * @param companyId Active company ID
 * @param mode      'view' for inline display (PDF in browser tab),
 *                  'download' (default) for save dialog
 */
export function buildDriveFileUrl(
  fileId: string,
  companyId: string,
  mode: "view" | "download" = "download"
): string {
  const params = new URLSearchParams({
    company_id: companyId,
  });
  if (mode === "view") {
    params.set("mode", "view");
  }
  return `/api/drive/files/${encodeURIComponent(fileId)}?${params.toString()}`;
}

/**
 * Compute the appropriate Drive sub-path for an invoice based on
 * direction and date. Keeps files organized by year/month so a
 * Drive folder doesn't accumulate thousands of loose PDFs.
 *
 *   issued (we issued):    invoices-out/2026/04/
 *   received (we got):     invoices-in/2026/04/
 *
 * Date defaults to today if not provided.
 */
export function buildInvoiceSubPath(
  direction: "issued" | "received",
  date?: string
): string {
  const d = date ? new Date(date) : new Date();
  // Use UTC to avoid timezone-related month boundaries
  const year = d.getUTCFullYear().toString();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const root = direction === "issued" ? "invoices-out" : "invoices-in";
  return `${root}/${year}/${month}`;
}
