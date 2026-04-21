/**
 * Generic factory for per-company store CRUD routes.
 *
 * Every store (assets, clients, documents, distributors, partners,
 * demo units, online links) follows the same pattern:
 *   - GET  → list rows from a specific tab
 *   - POST → create a row
 *   - PATCH → update with optimistic locking
 *   - DELETE → soft-delete with optimistic locking
 *
 * This helper collapses the repetitive auth + resolveCompany +
 * SheetsClient setup so each route file only needs to declare:
 *   - which tab name
 *   - validate/parse input → DB row shape
 *   - map DB row → client-facing shape
 *
 * Usage in an /api/{entity}/route.ts:
 *   const { GET, POST } = makeListCreateHandlers({
 *     tab: '11_distributors',
 *     responseKey: 'distributors',
 *     parseCreateBody: (body) => { ... },
 *     rowToApi: (row) => { ... },
 *   });
 *   export { GET, POST };
 *
 * And in /api/{entity}/[id]/route.ts:
 *   const { PATCH, DELETE } = makeUpdateDeleteHandlers({
 *     tab: '11_distributors',
 *     responseKey: 'distributor',
 *     parseUpdateBody: (body) => { ... },
 *     rowToApi: (row) => { ... },
 *   });
 *   export { PATCH, DELETE };
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveCompany } from "@/lib/resolve-company";
import {
  createSheetsClient,
  OptimisticLockError,
  RowNotFoundError,
} from "@/lib/sheets-client";
import type { TableName } from "@/lib/sheets-schema";

// ============================================================
// List + Create (GET + POST on /api/{entity})
// ============================================================

export interface ListCreateConfig<TBody, TApi> {
  tab: TableName;
  /** Key in response JSON: 'distributors' → { distributors: [...] } */
  responseKey: string;
  /** Singular form: 'distributor' → { distributor: {...} } for POST response */
  singularKey: string;
  /** Parse + validate request body for create */
  parseCreateBody: (body: unknown) => TBody | null;
  /** Convert a sheet row into the API response shape */
  rowToApi: (row: Record<string, unknown>) => TApi;
}

export function makeListCreateHandlers<
  TBody extends Record<string, string>,
  TApi,
>(config: ListCreateConfig<TBody, TApi>) {
  async function GET(request: Request) {
    const session = await auth();
    if (!session?.user?.email || !session.accessToken) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const companyId = url.searchParams.get("company_id");
    if (!companyId) {
      return NextResponse.json(
        { error: "Missing company_id" },
        { status: 400 }
      );
    }

    const company = await resolveCompany(
      session.accessToken,
      session.user.email,
      companyId
    );
    if (!company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    try {
      const client = createSheetsClient({
        accessToken: session.accessToken,
        spreadsheetId: company.sheetId,
        actor: session.user.email,
      });

      const rows = await client.list(config.tab);
      return NextResponse.json({
        [config.responseKey]: rows.map((r) =>
          config.rowToApi(r as unknown as Record<string, unknown>)
        ),
      });
    } catch (err) {
      console.error(`List ${config.tab} failed:`, err);
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  }

  async function POST(request: Request) {
    const session = await auth();
    if (!session?.user?.email || !session.accessToken) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const companyId = url.searchParams.get("company_id");
    if (!companyId) {
      return NextResponse.json(
        { error: "Missing company_id" },
        { status: 400 }
      );
    }

    const company = await resolveCompany(
      session.accessToken,
      session.user.email,
      companyId
    );
    if (!company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const data = config.parseCreateBody(body);
    if (!data) {
      return NextResponse.json(
        { error: "Invalid request data" },
        { status: 400 }
      );
    }

    try {
      const client = createSheetsClient({
        accessToken: session.accessToken,
        spreadsheetId: company.sheetId,
        actor: session.user.email,
      });

      const row = await client.create(config.tab, data);
      return NextResponse.json({
        [config.singularKey]: config.rowToApi(
          row as unknown as Record<string, unknown>
        ),
      });
    } catch (err) {
      console.error(`Create ${config.tab} failed:`, err);
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  }

  return { GET, POST };
}

// ============================================================
// Update + Delete (PATCH + DELETE on /api/{entity}/[id])
// ============================================================

export interface UpdateDeleteConfig<TApi> {
  tab: TableName;
  singularKey: string;
  entityName: string; // 'Distributor', 'Partner', etc. — for error messages
  parseUpdateBody: (
    body: unknown
  ) => (Record<string, string> & { expected_updated_at: string }) | null;
  rowToApi: (row: Record<string, unknown>) => TApi;
}

export function makeUpdateDeleteHandlers<TApi>(
  config: UpdateDeleteConfig<TApi>
) {
  async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
  ) {
    const { id } = await params;

    const session = await auth();
    if (!session?.user?.email || !session.accessToken) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const companyId = url.searchParams.get("company_id");
    if (!companyId) {
      return NextResponse.json(
        { error: "Missing company_id" },
        { status: 400 }
      );
    }

    const company = await resolveCompany(
      session.accessToken,
      session.user.email,
      companyId
    );
    if (!company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const patch = config.parseUpdateBody(body);
    if (!patch) {
      return NextResponse.json(
        { error: "Missing expected_updated_at" },
        { status: 400 }
      );
    }

    try {
      const client = createSheetsClient({
        accessToken: session.accessToken,
        spreadsheetId: company.sheetId,
        actor: session.user.email,
      });

      const row = await client.update(config.tab, id, patch);
      return NextResponse.json({
        [config.singularKey]: config.rowToApi(
          row as unknown as Record<string, unknown>
        ),
      });
    } catch (err) {
      if (err instanceof OptimisticLockError) {
        return NextResponse.json(
          {
            error: "Conflict",
            code: "OPTIMISTIC_LOCK",
            actualUpdatedAt: err.actualUpdatedAt,
          },
          { status: 409 }
        );
      }
      if (err instanceof RowNotFoundError) {
        return NextResponse.json(
          { error: `${config.entityName} not found: ${id}` },
          { status: 404 }
        );
      }
      console.error(`Update ${config.tab} failed:`, err);
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  }

  async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
  ) {
    const { id } = await params;

    const session = await auth();
    if (!session?.user?.email || !session.accessToken) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const companyId = url.searchParams.get("company_id");
    const expectedUpdatedAt = url.searchParams.get("expected_updated_at");
    if (!companyId || !expectedUpdatedAt) {
      return NextResponse.json(
        { error: "Missing company_id or expected_updated_at" },
        { status: 400 }
      );
    }

    const company = await resolveCompany(
      session.accessToken,
      session.user.email,
      companyId
    );
    if (!company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    try {
      const client = createSheetsClient({
        accessToken: session.accessToken,
        spreadsheetId: company.sheetId,
        actor: session.user.email,
      });

      await client.softDelete(config.tab, id, expectedUpdatedAt);
      return NextResponse.json({ ok: true });
    } catch (err) {
      if (err instanceof OptimisticLockError) {
        return NextResponse.json(
          {
            error: "Conflict",
            code: "OPTIMISTIC_LOCK",
            actualUpdatedAt: err.actualUpdatedAt,
          },
          { status: 409 }
        );
      }
      if (err instanceof RowNotFoundError) {
        return NextResponse.json(
          { error: `${config.entityName} not found: ${id}` },
          { status: 404 }
        );
      }
      console.error(`Delete ${config.tab} failed:`, err);
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  }

  return { PATCH, DELETE };
}
