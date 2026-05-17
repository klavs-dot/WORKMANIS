"use client";

/**
 * Sticky banner shown to external users (accountant / warehouse_manager)
 * on the pages where their data fetches currently fail with 401.
 *
 * Background: middleware lets external users into most pages, but
 * the route handlers behind them still require the owner's
 * Google OAuth accessToken. The fix (route-level service-account
 * branching) is tracked in docs/EXTERNAL_USERS_GAP.md. Until that
 * lands, the affected pages render their shell but the data never
 * arrives.
 *
 * This banner replaces the "looks broken" UX with an honest
 * "feature in progress" message so the user understands they're
 * not seeing a bug.
 */

import { useSession } from "next-auth/react";
import { Info } from "lucide-react";

export function ExternalUserBanner() {
  const { data: session } = useSession();
  const role = session?.role;
  if (!role || role === "owner") return null;

  const message =
    role === "warehouse_manager"
      ? "Noliktavas atbildīgā piekļuves režīms vēl nav pilnībā pieslēgts — datu ielāde notiek caur owner pārlūku. Ja redzi tukšus sarakstus, sazinies ar uzņēmuma īpašnieku."
      : "Grāmatvedības piekļuves režīms vēl nav pilnībā pieslēgts — datu ielāde notiek caur owner pārlūku. Ja redzi tukšus sarakstus, sazinies ar uzņēmuma īpašnieku.";

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex items-start gap-2 text-[12px] text-amber-900">
      <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />
      <p className="leading-snug">{message}</p>
    </div>
  );
}
