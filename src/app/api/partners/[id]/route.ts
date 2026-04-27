/**
 * Partners — PATCH and DELETE on 15_partners/{id}
 */

import { makeUpdateDeleteHandlers } from "@/lib/store-routes";

export const maxDuration = 30;

interface ApiPartner {
  id: string;
  category: string;
  name: string;
  regNumber: string;
  countryCode: string;
  address: string;
  contactPerson: string;
  email: string;
  phone: string;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

function parseUpdateBody(
  body: unknown
): (Record<string, string> & { expected_updated_at: string }) | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.expected_updated_at !== "string" || !b.expected_updated_at) {
    return null;
  }

  const patch: Record<string, string> & { expected_updated_at: string } = {
    expected_updated_at: b.expected_updated_at,
  };

  for (const key of [
    "category",
    "name",
    "reg_number",
    "country_code",
    "address",
    "contact_person",
    "email",
    "phone",
    "comment",
  ] as const) {
    const v = b[key];
    if (typeof v === "string") patch[key] = v;
  }

  return patch;
}

function rowToApi(row: Record<string, unknown>): ApiPartner {
  return {
    id: row.id as string,
    category: (row.category as string) ?? "razotaji",
    name: (row.name as string) ?? "",
    regNumber: (row.reg_number as string) ?? "",
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

export const { PATCH, DELETE } = makeUpdateDeleteHandlers<ApiPartner>({
  tab: "15_partners",
  singularKey: "partner",
  entityName: "Partner",
  parseUpdateBody,
  rowToApi,
});
