/**
 * Online links — CRUD on 13_online_links tab.
 */

import { makeListCreateHandlers } from "@/lib/store-routes";

export const maxDuration = 30;

interface LinkRow extends Record<string, string> {
  product_name: string;
  url: string;
  comment: string;
}

interface ApiLink {
  id: string;
  productName: string;
  url: string;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

function parseCreateBody(body: unknown): LinkRow | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.product_name !== "string" || !b.product_name.trim()) return null;
  if (typeof b.url !== "string" || !b.url.trim()) return null;
  return {
    product_name: (b.product_name as string).trim(),
    url: (b.url as string).trim(),
    comment: typeof b.comment === "string" ? b.comment : "",
  };
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

export const { GET, POST } = makeListCreateHandlers<LinkRow, ApiLink>({
  tab: "13_online_links",
  responseKey: "onlineLinks",
  singularKey: "onlineLink",
  parseCreateBody,
  rowToApi,
});
