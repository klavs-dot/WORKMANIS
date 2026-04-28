import { makeWarehouseUpdateDeleteHandlers } from "@/lib/warehouse-routes";

export const maxDuration = 30;

interface ApiEmployee {
  id: string;
  email: string;
  password: string;
  role: string;
  active: boolean;
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

  if (typeof b.email === "string") patch.email = b.email.trim().toLowerCase();
  if (typeof b.password === "string") patch.password = b.password;
  if (typeof b.role === "string") patch.role = b.role;
  if (typeof b.active === "boolean") patch.active = b.active ? "1" : "0";

  return patch;
}

function rowToApi(row: Record<string, unknown>): ApiEmployee {
  return {
    id: row.id as string,
    email: (row.email as string) ?? "",
    password: (row.password as string) ?? "",
    role: (row.role as string) ?? "Noliktavas atbildīgais",
    active: row.active === "1" || row.active === "true",
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

export const { PATCH, DELETE } = makeWarehouseUpdateDeleteHandlers<ApiEmployee>({
  tab: "04_warehouse_employees",
  parseUpdateBody,
  rowToApi,
});
