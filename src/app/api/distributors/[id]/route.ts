/**
 * Distributors — PATCH and DELETE on 11_distributors/{id}
 */

import { makeUpdateDeleteHandlers } from "@/lib/store-routes";

export const maxDuration = 30;

interface ApiDistributor {
  id: string;
  name: string;
  countryCode: string;
  address: string;
  requisites: string;
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

  for (const key of ["name", "country_code", "address", "requisites", "comment"] as const) {
    const v = b[key];
    if (typeof v === "string") patch[key] = v;
  }

  return patch;
}

function rowToApi(row: Record<string, unknown>): ApiDistributor {
  return {
    id: row.id as string,
    name: (row.name as string) ?? "",
    countryCode: (row.country_code as string) ?? "LV",
    address: (row.address as string) ?? "",
    requisites: (row.requisites as string) ?? "",
    comment: (row.comment as string) ?? "",
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

export const { PATCH, DELETE } = makeUpdateDeleteHandlers<ApiDistributor>({
  tab: "11_distributors",
  singularKey: "distributor",
  entityName: "Distributor",
  parseUpdateBody,
  rowToApi,
});
