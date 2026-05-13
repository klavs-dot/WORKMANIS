/**
 * Owner sheet ID registration.
 *
 * Called from /api/companies/list (the first server-side hit
 * after Google OAuth login) to make sure the owner's
 * account-master sheet ID is recorded in OWNER_SHEET_REGISTRY.
 * Without this step, external users couldn't log in even with
 * the right password — the system wouldn't know which sheet to
 * check their credentials against.
 *
 * Storage backend: in this MVP we use OWNER_SHEET_REGISTRY env
 * variable holding a JSON map. Writes to env vars at runtime
 * aren't supported in Vercel, so we ALSO store the mapping in
 * the owner's own account-master sheet at tab '05_owner_registry'
 * (single-row, holds the owner's own sheet ID + email — used as
 * a self-reference probe by the service-account-based flow).
 *
 * The chicken-and-egg situation:
 *   - To know which sheet to read, we need ownerEmail → sheetId
 *   - To get sheetId, we walk Drive (needs owner OAuth)
 *   - External users don't have owner OAuth
 *
 * Resolution: OWNER_SHEET_REGISTRY env var is populated MANUALLY
 * by the system administrator (Klāvs) after first owner login.
 * The owner login response includes the sheet ID; Klāvs copies
 * it into Vercel env vars. One-time setup per owner.
 *
 * A nicer auto-population (Vercel KV or Postgres) is future work.
 *
 * NOTE: This file currently only exposes a HELPER to read the
 * owner's sheet ID from their session/folder walk. The actual
 * registry update is manual (env var). The helper returns the
 * sheet ID so the UI can show it during onboarding.
 */

export type OwnerSheetRegistration = {
  ownerEmail: string;
  sheetId: string;
  status: "registered" | "needs-env-var" | "missing";
};

/**
 * Check whether the given owner is registered in
 * OWNER_SHEET_REGISTRY. Returns the registration status so the
 * UI can show appropriate guidance (e.g. "copy this sheet ID
 * into Vercel env vars to enable external user logins").
 */
export function checkOwnerSheetRegistration(
  ownerEmail: string,
  sheetIdFromFolderWalk: string | null
): OwnerSheetRegistration {
  const registryJson = process.env.OWNER_SHEET_REGISTRY;
  if (!registryJson) {
    return {
      ownerEmail,
      sheetId: sheetIdFromFolderWalk ?? "",
      status: sheetIdFromFolderWalk ? "needs-env-var" : "missing",
    };
  }

  try {
    const registry = JSON.parse(registryJson) as Record<string, string>;
    const registered = registry[ownerEmail.toLowerCase()];
    if (registered) {
      return {
        ownerEmail,
        sheetId: registered,
        status: "registered",
      };
    }
  } catch {
    // fall through to needs-env-var
  }

  return {
    ownerEmail,
    sheetId: sheetIdFromFolderWalk ?? "",
    status: sheetIdFromFolderWalk ? "needs-env-var" : "missing",
  };
}
