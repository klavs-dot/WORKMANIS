/**
 * Invoice templates — CRUD on 34_invoice_templates tab.
 *
 * Templates are reusable invoice drafts associated with a client.
 * The InvoiceContent field is a discriminated union (service vs
 * product with line items) which doesn't fit cleanly into scalar
 * columns — stored as JSON in content_json.
 */

import { makeListCreateHandlers } from "@/lib/store-routes";

export const maxDuration = 30;

interface TemplateRow extends Record<string, string> {
  keyword: string;
  client_id: string;
  language: string;
  content_json: string;
  reference: string;
}

interface ApiTemplate {
  id: string;
  keyword: string;
  clientId: string;
  language: string;
  content: unknown; // Parsed InvoiceContent
  reference: string | undefined;
  createdAt: string;
  updatedAt: string;
}

function parseCreateBody(body: unknown): TemplateRow | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.keyword !== "string" || !b.keyword) return null;
  if (typeof b.client_id !== "string" || !b.client_id) return null;
  if (!b.content || typeof b.content !== "object") return null;

  return {
    keyword: b.keyword,
    client_id: b.client_id,
    language: typeof b.language === "string" ? b.language : "lv",
    content_json: JSON.stringify(b.content),
    reference: typeof b.reference === "string" ? b.reference : "",
  };
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

export const { GET, POST } = makeListCreateHandlers<
  TemplateRow,
  ApiTemplate
>({
  tab: "34_invoice_templates",
  responseKey: "templates",
  singularKey: "template",
  parseCreateBody,
  rowToApi,
});
