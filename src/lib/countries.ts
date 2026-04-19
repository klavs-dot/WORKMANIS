export interface CountryOption {
  code: string;
  name: string;
  eu: boolean;
}

/** Curated country list (LV-focused, EU first, then common partners) */
export const COUNTRIES: CountryOption[] = [
  { code: "LV", name: "Latvija", eu: true },
  { code: "EE", name: "Igaunija", eu: true },
  { code: "LT", name: "Lietuva", eu: true },
  { code: "DE", name: "Vācija", eu: true },
  { code: "FR", name: "Francija", eu: true },
  { code: "IT", name: "Itālija", eu: true },
  { code: "ES", name: "Spānija", eu: true },
  { code: "NL", name: "Nīderlande", eu: true },
  { code: "BE", name: "Beļģija", eu: true },
  { code: "PL", name: "Polija", eu: true },
  { code: "FI", name: "Somija", eu: true },
  { code: "SE", name: "Zviedrija", eu: true },
  { code: "DK", name: "Dānija", eu: true },
  { code: "AT", name: "Austrija", eu: true },
  { code: "CZ", name: "Čehija", eu: true },
  { code: "IE", name: "Īrija", eu: true },
  { code: "PT", name: "Portugāle", eu: true },
  { code: "GR", name: "Grieķija", eu: true },
  { code: "HU", name: "Ungārija", eu: true },
  { code: "RO", name: "Rumānija", eu: true },
  { code: "BG", name: "Bulgārija", eu: true },
  { code: "HR", name: "Horvātija", eu: true },
  { code: "SK", name: "Slovākija", eu: true },
  { code: "SI", name: "Slovēnija", eu: true },
  { code: "LU", name: "Luksemburga", eu: true },
  { code: "MT", name: "Malta", eu: true },
  { code: "CY", name: "Kipra", eu: true },
  { code: "GB", name: "Lielbritānija", eu: false },
  { code: "NO", name: "Norvēģija", eu: false },
  { code: "CH", name: "Šveice", eu: false },
  { code: "US", name: "ASV", eu: false },
  { code: "CA", name: "Kanāda", eu: false },
  { code: "UA", name: "Ukraina", eu: false },
];

export function getCountryByCode(code: string): CountryOption | undefined {
  return COUNTRIES.find((c) => c.code.toUpperCase() === code.toUpperCase());
}

export function getCountryName(code: string): string {
  return getCountryByCode(code)?.name ?? code;
}
