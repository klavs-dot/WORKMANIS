// ============================================================
// VAT resolver (placeholder)
//
// NOT a real legal engine. This is a thin rule set used to
// pre-fill UI hints. The final VAT/legal reference should be
// reviewed by an accountant before issuing the invoice.
//
// Rules:
//  - client in LV                      -> standard 21%
//  - client in EU (not LV) + VAT nr    -> reverse charge 0%
//  - client in EU (not LV) no VAT nr   -> standard 21% (consumer)
//  - client outside EU                 -> out of scope 0%
// ============================================================

import type { Client, VATMode, VATResolution } from "./billing-types";

const EU_COUNTRY_CODES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

const LEGAL_REFS: Record<VATMode, string> = {
  standard:
    "PVN 21% saskaņā ar Pievienotās vērtības nodokļa likuma 41. pantu.",
  reverse_charge:
    "PVN netiek piemērots saskaņā ar ES pārrobežu darījumu regulējumu (reverse charge). Nodokli aprēķina un maksā pakalpojuma saņēmējs — PVN likuma 142. pants.",
  out_of_scope:
    "Darījums nav PVN objekts Latvijā (pakalpojums sniegts ārpus ES).",
  zero_rated:
    "0% PVN likme saskaņā ar PVN likuma 43. pantu (preču eksports).",
  exempt:
    "Darījums atbrīvots no PVN saskaņā ar PVN likuma 52. pantu.",
};

const EXPLANATIONS: Record<VATMode, string> = {
  standard: "Pievieno standarta 21% PVN.",
  reverse_charge:
    "Klients ir ES uzņēmums ar PVN numuru — tiek piemērots reverse charge princips. PVN šajā rēķinā nav iekļauts.",
  out_of_scope:
    "Klients atrodas ārpus ES — darījums neietilpst Latvijas PVN piemērošanas jomā.",
  zero_rated: "Tiek piemērota 0% PVN likme.",
  exempt: "Darījums atbrīvots no PVN.",
};

export function resolveVAT(client: Client | null | undefined): VATResolution {
  const fallback: VATResolution = {
    mode: "standard",
    appliesVAT: true,
    legalReference: LEGAL_REFS.standard,
    explanation: EXPLANATIONS.standard,
  };

  if (!client) return fallback;

  const cc = (client.countryCode || "").toUpperCase();
  const hasVAT = !!client.vatNumber && client.vatNumber.trim().length > 0;

  // Latvia — always standard VAT
  if (cc === "LV") return fallback;

  // EU B2B with VAT number -> reverse charge
  if (EU_COUNTRY_CODES.has(cc) && hasVAT) {
    return {
      mode: "reverse_charge",
      appliesVAT: false,
      legalReference: LEGAL_REFS.reverse_charge,
      explanation: EXPLANATIONS.reverse_charge,
    };
  }

  // Outside EU
  if (!EU_COUNTRY_CODES.has(cc) && cc.length > 0) {
    return {
      mode: "out_of_scope",
      appliesVAT: false,
      legalReference: LEGAL_REFS.out_of_scope,
      explanation: EXPLANATIONS.out_of_scope,
    };
  }

  // EU B2C without VAT number -> standard LV VAT applies
  return fallback;
}

export function legalRefFor(mode: VATMode): string {
  return LEGAL_REFS[mode];
}

export function explanationFor(mode: VATMode): string {
  return EXPLANATIONS[mode];
}
