/**
 * Demo units — PATCH and DELETE on 14_demo_units/{id}
 */

import { makeUpdateDeleteHandlers } from "@/lib/store-routes";

export const maxDuration = 30;

interface ApiDemo {
  id: string;
  name: string;
  tester: string;
  location: string;
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

  for (const key of ["name", "tester", "location", "comment"] as const) {
    const v = b[key];
    if (typeof v === "string") patch[key] = v;
  }

  return patch;
}

function rowToApi(row: Record<string, unknown>): ApiDemo {
  return {
    id: row.id as string,
    name: (row.name as string) ?? "",
    tester: (row.tester as string) ?? "",
    location: (row.location as string) ?? "",
    comment: (row.comment as string) ?? "",
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

export const { PATCH, DELETE } = makeUpdateDeleteHandlers<ApiDemo>({
  tab: "14_demo_units",
  singularKey: "demoProduct",
  entityName: "Demo unit",
  parseUpdateBody,
  rowToApi,
});
