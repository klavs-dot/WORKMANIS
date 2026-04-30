"use client";

/**
 * InvoiceFileActions — reusable button group for an invoice card.
 *
 * Renders three states based on whether a Drive file is attached:
 *
 *   1. File attached       → [Skatīt] [Lejupielādēt]
 *                            both buttons active, route through
 *                            the /api/drive/files/{id} proxy
 *
 *   2. No file but uploads  → [Pievienot rēķinu]
 *      allowed                opens a hidden <input type="file">
 *                             that uploads to Drive and PATCHes
 *                             the invoice's fileDriveId field
 *
 *   3. No file, no upload   → [Skatīt] [Lejupielādēt] greyed out
 *      callback (read-only)   with a tooltip
 *                             ('Rēķina PDF nav pievienots')
 *
 * Used by Ienākošie, Izejošie, and Automātiskie tabs. NOT used by
 * Fiziskie maksājumi (POS / ATM transactions don't have invoices —
 * they're recorded directly from the bank statement).
 */

import { useRef, useState } from "react";
import { Eye, Download, Paperclip, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/lib/company-context";
import {
  buildDriveFileUrl,
  buildInvoiceSubPath,
  uploadFileToDrive,
} from "@/lib/drive-files";
import { pushToastGlobally } from "@/lib/toast-context";

interface InvoiceFileActionsProps {
  /** Drive file ID if a PDF has been uploaded; undefined otherwise */
  fileDriveId: string | undefined;
  /** Original filename (shown in tooltip when present); optional */
  fileName?: string;
  /** Direction determines the Drive sub-folder for new uploads */
  direction: "issued" | "received";
  /** Date to use when computing the Drive sub-folder (year/month).
   *  Falls back to today when not provided. */
  invoiceDate?: string;
  /**
   * Called after a successful upload with the new Drive file ID.
   * Caller is responsible for PATCH-ing the invoice record so the
   * ID persists. If undefined, the upload button is hidden — UI
   * shows just the (disabled) view/download buttons.
   */
  onFileUploaded?: (driveFileId: string, originalName: string) => void;
  /** Compact size variant for tight rows (default 'sm') */
  size?: "sm" | "icon";
}

export function InvoiceFileActions({
  fileDriveId,
  fileName,
  direction,
  invoiceDate,
  onFileUploaded,
  size = "sm",
}: InvoiceFileActionsProps) {
  const { activeCompany } = useCompany();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleView = () => {
    if (!fileDriveId || !activeCompany?.id) return;
    const url = buildDriveFileUrl(fileDriveId, activeCompany.id, "view");
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDownload = () => {
    if (!fileDriveId || !activeCompany?.id) return;
    const url = buildDriveFileUrl(fileDriveId, activeCompany.id, "download");
    // Direct navigation triggers the download due to Content-
    // Disposition: attachment header. window.location keeps the
    // current tab; a hidden anchor click would also work but
    // navigation is simpler and the response stays in this tab
    // briefly before being saved.
    window.location.href = url;
  };

  const handleFilePicked = async (file: File) => {
    if (!activeCompany?.id) {
      pushToastGlobally("error", "Nav aktīvā uzņēmuma", 6000);
      return;
    }

    // Size sanity — same cap as the server enforces
    if (file.size > 25 * 1024 * 1024) {
      pushToastGlobally(
        "error",
        `Fails par lielu (${Math.round(file.size / 1024 / 1024)} MB). Maksimums: 25 MB.`,
        7000
      );
      return;
    }

    // PDF is the expected case but we also accept images
    const allowedExt = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];
    const lower = file.name.toLowerCase();
    if (!allowedExt.some((ext) => lower.endsWith(ext))) {
      pushToastGlobally(
        "error",
        "Nepareizs faila tips. Pieņemam: PDF, PNG, JPG, WebP.",
        7000
      );
      return;
    }

    setUploading(true);
    try {
      const subPath = buildInvoiceSubPath(direction, invoiceDate);
      const result = await uploadFileToDrive(file, subPath, activeCompany.id);
      onFileUploaded?.(result.fileId, file.name);
      pushToastGlobally("success", `Augšupielādēts: ${file.name}`, 5000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Augšupielāde neizdevās";
      pushToastGlobally("error", msg, 8000);
    } finally {
      setUploading(false);
    }
  };

  // Hidden input — shared between the 'attach' button (no file yet)
  // and a future 'replace' UI (file exists, user wants to swap it)
  const hiddenInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void handleFilePicked(f);
        // Reset so the same file can be picked again after errors
        e.target.value = "";
      }}
    />
  );

  // Branch 1: file attached — view + download both active
  if (fileDriveId) {
    if (size === "icon") {
      return (
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleView}
            title={fileName ? `Skatīt: ${fileName}` : "Skatīt rēķinu"}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleDownload}
            title="Lejupielādēt rēķinu"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </>
      );
    }
    return (
      <>
        <Button variant="ghost" size="sm" onClick={handleView}>
          <Eye className="h-3.5 w-3.5" />
          Skatīt
        </Button>
        <Button variant="ghost" size="sm" onClick={handleDownload}>
          <Download className="h-3.5 w-3.5" />
          Lejupielādēt
        </Button>
      </>
    );
  }

  // Branch 2: no file — show upload button if callback provided
  if (onFileUploaded) {
    return (
      <>
        {hiddenInput}
        <Button
          variant="secondary"
          size={size === "icon" ? "icon-sm" : "sm"}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Pievienot rēķina PDF"
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Paperclip className="h-3.5 w-3.5" />
          )}
          {size === "icon" ? null : uploading ? "Augšupielādē…" : "Pievienot rēķinu"}
        </Button>
      </>
    );
  }

  // Branch 3: no file, no upload allowed — show disabled hint buttons
  if (size === "icon") {
    return (
      <>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled
          title="Rēķina PDF nav pievienots"
        >
          <Eye className="h-3.5 w-3.5 opacity-40" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled
          title="Rēķina PDF nav pievienots"
        >
          <Download className="h-3.5 w-3.5 opacity-40" />
        </Button>
      </>
    );
  }
  return (
    <span
      className="text-[11px] text-graphite-400 italic px-2"
      title="Rēķina PDF nav pievienots"
    >
      Bez PDF
    </span>
  );
}
