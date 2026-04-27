/**
 * Warehouse API route helpers.
 *
 * Mirrors store-routes.ts (the per-company CRUD wrapper) but for
 * the global Workmanis_noliktava sheet. Skips company resolution
 * since warehouse data isn't partitioned by company.
 *
 * Why not reuse store-routes? It's deeply coupled to resolveCompany +
 * the company-id query param. Adapting it would mean either two
 * code paths inside one helper or a leaky 'isWarehouse' flag.
 * Cleaner to have a parallel narrow helper.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createSheetsClient } from "./sheets-client";
import { getOrCreateWarehouseSheet } from "./warehouse-provisioning";
import type { TableName } from "./sheets-schema";

interface ListCreateConfig<TBody, TApi> {
  tab: TableName;
  responseKey: string;
  parseCreateBody: (body: unknown) => TBody | null;
  rowToApi: (row: Record<string, unknown>) => TApi;
}

interface UpdateDeleteConfig<TApi> {
  tab: TableName;
  rowToApi: (row: Record<string, unknown>) => TApi;
  parseUpdateBody: (
    body: unknown
  ) => (Record<string, string> & { expected_updated_at: string }) | null;
}

/**
 * Build GET (list) and POST (create) handlers for a warehouse tab.
 * Mirrors makeListCreateHandlers from store-routes but without
 * company resolution.
 */
export function makeWarehouseListCreateHandlers<
  TBody extends Record<string, string>,
  TApi,
>(config: ListCreateConfig<TBody, TApi>) {
  async function GET() {
    const session = await auth();
    if (!session?.user?.email || !session.accessToken) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    try {
      const sheetId = await getOrCreateWarehouseSheet(session.accessToken);
      const client = createSheetsClient({
        accessToken: session.accessToken,
        spreadsheetId: sheetId,
        actor: session.user.email,
      });

      const rows = await client.list(config.tab);
      return NextResponse.json({
        [config.responseKey]: rows.map((r) =>
          config.rowToApi(r as unknown as Record<string, unknown>)
        ),
      });
    } catch (err) {
      console.error(`Warehouse list ${config.tab} failed:`, err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error" },
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const data = config.parseCreateBody(body);
    if (!data) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    try {
      const sheetId = await getOrCreateWarehouseSheet(session.accessToken);
      const client = createSheetsClient({
        accessToken: session.accessToken,
        spreadsheetId: sheetId,
        actor: session.user.email,
      });

      const created = await client.create(config.tab, data);
      return NextResponse.json({
        item: config.rowToApi(created as unknown as Record<string, unknown>),
      });
    } catch (err) {
      console.error(`Warehouse create ${config.tab} failed:`, err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 }
      );
    }
  }

  return { GET, POST };
}

/**
 * Build PATCH (update) and DELETE handlers for a warehouse tab.
 * Mirrors makeUpdateDeleteHandlers from store-routes.
 */
export function makeWarehouseUpdateDeleteHandlers<TApi>(
  config: UpdateDeleteConfig<TApi>
) {
  async function PATCH(
    request: Request,
    ctx: { params: Promise<{ id: string }> }
  ) {
    const session = await auth();
    if (!session?.user?.email || !session.accessToken) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
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
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    try {
      const sheetId = await getOrCreateWarehouseSheet(session.accessToken);
      const client = createSheetsClient({
        accessToken: session.accessToken,
        spreadsheetId: sheetId,
        actor: session.user.email,
      });

      const updated = await client.update(config.tab, id, patch);
      return NextResponse.json({
        item: config.rowToApi(updated as unknown as Record<string, unknown>),
      });
    } catch (err) {
      console.error(`Warehouse update ${config.tab} failed:`, err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 }
      );
    }
  }

  async function DELETE(
    _request: Request,
    ctx: { params: Promise<{ id: string }> }
  ) {
    const session = await auth();
    if (!session?.user?.email || !session.accessToken) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    try {
      const sheetId = await getOrCreateWarehouseSheet(session.accessToken);
      const client = createSheetsClient({
        accessToken: session.accessToken,
        spreadsheetId: sheetId,
        actor: session.user.email,
      });

      // Read the row first to get its updated_at for optimistic locking
      const existing = await client.get(config.tab, id);
      if (!existing) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      await client.softDelete(
        config.tab,
        id,
        (existing as { updated_at: string }).updated_at
      );
      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error(`Warehouse delete ${config.tab} failed:`, err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 }
      );
    }
  }

  return { PATCH, DELETE };
}
