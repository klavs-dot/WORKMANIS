/**
 * Distributors — CRUD on 11_distributors tab.
 */

import { makeListCreateHandlers } from "@/lib/store-routes";

export const maxDuration = 30;

interface DistributorRow extends Record<string, string> {
  name: string;
  country_code: string;
  address: string;
  requisites: string;
  comment: string;
}

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

function parseCreateBody(body: unknown): DistributorRow | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || !b.name.trim()) return null;
  return {
    name: (b.name as string).trim(),
    country_code: typeof b.country_code === "string" ? b.country_code : "LV",
    address: typeof b.address === "string" ? b.address : "",
    requisites: typeof b.requisites === "string" ? b.requisites : "",
    comment: typeof b.comment === "string" ? b.comment : "",
  };
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

export const { GET, POST } = makeListCreateHandlers<
  DistributorRow,
  ApiDistributor
>({
  tab: "11_distributors",
  responseKey: "distributors",
  singularKey: "distributor",
  parseCreateBody,
  rowToApi,
});
