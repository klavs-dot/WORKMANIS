/**
 * Core shared types.
 *
 * NOTE: many entity types in this app live in their domain-specific
 * stores rather than here:
 *   - IssuedInvoice / ReceivedInvoice → src/lib/billing-store.tsx
 *   - BankPayment → src/lib/payments-store.tsx
 *   - Employee → src/lib/employees-store.tsx
 *   - Client → src/lib/billing-types.ts
 *   - Distributor / BusinessContact / OnlineLink → src/lib/network-types.ts
 *   - InventoryItem / Movement → src/lib/warehouse-store.tsx
 *
 * This file keeps only the cross-cutting types used in multiple
 * places (Company + its requisites, language picker enum).
 */

export interface CompanyRequisites {
  legalName?: string;
  regNumber?: string;
  vatNumber?: string;
  legalAddress?: string;
  deliveryAddress?: string;
  contactEmail?: string;
  invoiceEmail?: string;
  iban?: string;
  bankName?: string;
  swift?: string;
  phone?: string;
  website?: string;
  /**
   * Hex color (e.g. '#10b981') chosen by the user when creating
   * or editing the company. Used to tint the left sidebar and
   * other accents when this company is active, so the user has a
   * visual cue of which entity they're working with.
   *
   * Stored as the requisite (not just local UI state) so it
   * persists across browsers and is shared if the user invites
   * someone else to the company later.
   */
  brandColor?: string;
}

/** Language token for the copy-requisites action. */
export type CopyFormat = "lv" | "en";

export interface Company extends CompanyRequisites {
  id: string;
  name: string;
  /**
   * @deprecated Legacy field — use brandColor (hex) instead.
   * Kept for backwards compatibility with old localStorage cache
   * data; will be removed once everyone has re-saved at least
   * once.
   */
  color?: string;
  logoUrl?: string;
  /** Drive file ID of the uploaded logo (PNG/SVG). When set, the
   *  UI renders the logo via /api/drive/files/{id}?company_id=X
   *  rather than via logoUrl. logoUrl is kept for legacy/external
   *  hosting; logoDriveId is the preferred path going forward. */
  logoDriveId?: string;
  /** Backend fields (only present when hydrated from Sheets backend) */
  folderDriveId?: string;
  sheetId?: string;
  slug?: string;
}
