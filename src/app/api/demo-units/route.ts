/**
 * Demo units — CRUD on 14_demo_units tab.
 */

import { makeListCreateHandlers } from "@/lib/store-routes";

export const maxDuration = 30;

interface DemoRow extends Record<string, string> {
  name: string;
  tester: string;
  location: string;
  comment: string;
}

interface ApiDemo {
  id: string;
  name: string;
  tester: string;
  location: string;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

function parseCreateBody(body: unknown): DemoRow | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || !b.name.trim()) return null;
  return {
    name: (b.name as string).trim(),
    tester: typeof b.tester === "string" ? b.tester : "",
    location: typeof b.location === "string" ? b.location : "",
    comment: typeof b.comment === "string" ? b.comment : "",
  };
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

export const { GET, POST } = makeListCreateHandlers<DemoRow, ApiDemo>({
  tab: "14_demo_units",
  responseKey: "demoProducts",
  singularKey: "demoProduct",
  parseCreateBody,
  rowToApi,
});
