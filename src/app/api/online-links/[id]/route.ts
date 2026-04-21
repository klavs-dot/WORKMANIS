/**
 * Online links — PATCH and DELETE on 13_online_links/{id}
 */

import { makeUpdateDeleteHandlers } from "@/lib/store-routes";

export const maxDuration = 30;

interface ApiLink {
  id: string;
  productName: string;
  url: string;
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

  if (typeof b.product_name === "string") patch.product_name = b.product_name;
  if (typeof b.url === "string") patch.url = b.url;
  if (typeof b.comment === "string") patch.comment = b.comment;

  return patch;
}

function rowToApi(row: Record<string, unknown>): ApiLink {
  return {
    id: row.id as string,
    productName: (row.product_name as string) ?? "",
    url: (row.url as string) ?? "",
    comment: (row.comment as string) ?? "",
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

export const { PATCH, DELETE } = makeUpdateDeleteHandlers<ApiLink>({
  tab: "13_online_links",
  singularKey: "onlineLink",
  entityName: "Online link",
  parseUpdateBody,
  rowToApi,
});
