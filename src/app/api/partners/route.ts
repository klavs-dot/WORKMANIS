/**
 * Partners / BusinessContacts — CRUD on 15_partners tab.
 *
 * Category values: 'razotaji' | 'piegadataji' | 'pakalpojumi' | 'logistika'
 */

import { makeListCreateHandlers } from "@/lib/store-routes";

export const maxDuration = 30;

interface PartnerRow extends Record<string, string> {
  category: string;
  name: string;
  country_code: string;
  address: string;
  contact_person: string;
  email: string;
  phone: string;
  comment: string;
}

interface ApiPartner {
  id: string;
  category: string;
  name: string;
  countryCode: string;
  address: string;
  contactPerson: string;
  email: string;
  phone: string;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

function parseCreateBody(body: unknown): PartnerRow | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || !b.name.trim()) return null;
  if (typeof b.category !== "string" || !b.category) return null;
  return {
    category: b.category,
    name: (b.name as string).trim(),
    country_code: typeof b.country_code === "string" ? b.country_code : "LV",
    address: typeof b.address === "string" ? b.address : "",
    contact_person:
      typeof b.contact_person === "string" ? b.contact_person : "",
    email: typeof b.email === "string" ? b.email : "",
    phone: typeof b.phone === "string" ? b.phone : "",
    comment: typeof b.comment === "string" ? b.comment : "",
  };
}

function rowToApi(row: Record<string, unknown>): ApiPartner {
  return {
    id: row.id as string,
    category: (row.category as string) ?? "razotaji",
    name: (row.name as string) ?? "",
    countryCode: (row.country_code as string) ?? "LV",
    address: (row.address as string) ?? "",
    contactPerson: (row.contact_person as string) ?? "",
    email: (row.email as string) ?? "",
    phone: (row.phone as string) ?? "",
    comment: (row.comment as string) ?? "",
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

export const { GET, POST } = makeListCreateHandlers<PartnerRow, ApiPartner>({
  tab: "15_partners",
  responseKey: "partners",
  singularKey: "partner",
  parseCreateBody,
  rowToApi,
});
