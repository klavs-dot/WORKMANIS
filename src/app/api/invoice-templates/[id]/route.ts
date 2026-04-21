/**
 * Invoice templates — PATCH and DELETE on 34_invoice_templates/{id}
 */

import { makeUpdateDeleteHandlers } from "@/lib/store-routes";

export const maxDuration = 30;

interface ApiTemplate {
  id: string;
  keyword: string;
  clientId: string;
  language: string;
  content: unknown;
  reference: string | undefined;
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

  if (typeof b.keyword === "string") patch.keyword = b.keyword;
  if (typeof b.client_id === "string") patch.client_id = b.client_id;
  if (typeof b.clientId === "string") patch.client_id = b.clientId;
  if (typeof b.language === "string") patch.language = b.language;
  if (typeof b.reference === "string") patch.reference = b.reference;
  // Content is serialized as JSON
  if (b.content && typeof b.content === "object") {
    patch.content_json = JSON.stringify(b.content);
  }

  return patch;
}

function rowToApi(row: Record<string, unknown>): ApiTemplate {
  let content: unknown = {};
  try {
    const raw = (row.content_json as string) || "";
    content = raw ? JSON.parse(raw) : {};
  } catch {
    content = {};
  }

  return {
    id: row.id as string,
    keyword: (row.keyword as string) ?? "",
    clientId: (row.client_id as string) ?? "",
    language: (row.language as string) ?? "lv",
    content,
    reference:
      ((row.reference as string) || undefined) as string | undefined,
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

export const { PATCH, DELETE } = makeUpdateDeleteHandlers<ApiTemplate>({
  tab: "34_invoice_templates",
  singularKey: "template",
  entityName: "Template",
  parseUpdateBody,
  rowToApi,
});
