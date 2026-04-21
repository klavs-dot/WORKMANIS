/**
 * GET /api/audit-log?company_id=...&limit=50
 *
 * Returns the most recent audit log entries from 99_audit_log
 * for the active company. Default limit is 50. Max limit is 200
 * to keep the response size reasonable.
 *
 * Entries are sorted by timestamp DESC (newest first). Since audit
 * log writes are append-only and use the same ID-prefix-DDMMYY-N
 * generator as everything else, sorting by timestamp is reliable.
 *
 * This is purely diagnostic / transparency. Read-only, no writes.
 *
 * Each entry includes:
 *   - id (aud-DDMMYY-N)
 *   - timestamp (ISO)
 *   - actor (user email)
 *   - action (create / update / softDelete)
 *   - entity_table (e.g. '10_clients')
 *   - entity_id (e.g. 'cli-210426-1')
 *   - changes_json (raw JSON string; too big to parse server-side
 *     every time, let the UI decide if it wants to show details)
 *
 * Note: this is an infinite-scroll-friendly shape. If we later
 * want pagination by timestamp cursor, it's trivial to add.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveCompany } from "@/lib/resolve-company";
import { createSheetsClient } from "@/lib/sheets-client";

export const maxDuration = 30;

interface AuditRow extends Record<string, unknown> {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  entity_table: string;
  entity_id: string;
  changes_json: string;
  created_at: string;
  updated_at: string;
}

export async function GET(request: Request) {
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
    return NextResponse.json({ error: "Missing company_id" }, { status: 400 });
  }

  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(
    Math.max(1, parseInt(limitParam ?? "50", 10) || 50),
    200
  );

  const company = await resolveCompany(
    session.accessToken,
    session.user.email,
    companyId
  );
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  try {
    const client = createSheetsClient({
      accessToken: session.accessToken,
      spreadsheetId: company.sheetId,
      actor: session.user.email,
    });

    // Audit log uses includeDeleted=true because deleted_at isn't
    // meaningful on audit entries — they're append-only. But the
    // default list() filter excludes rows with deleted_at set, and
    // nothing ever sets deleted_at on audit rows, so plain list()
    // works too. Using includeDeleted for clarity.
    const all = await client.list<AuditRow>("99_audit_log", {
      includeDeleted: true,
    });

    // Sort DESC by timestamp. Fall back to created_at if timestamp
    // is empty (shouldn't happen but be defensive).
    const sorted = all.slice().sort((a, b) => {
      const ta = (a.timestamp as string) || (a.created_at as string) || "";
      const tb = (b.timestamp as string) || (b.created_at as string) || "";
      return tb.localeCompare(ta);
    });

    const recent = sorted.slice(0, limit).map((r) => ({
      id: r.id as string,
      timestamp: (r.timestamp as string) || (r.created_at as string) || "",
      actor: (r.actor as string) || "",
      action: (r.action as string) || "",
      entityTable: (r.entity_table as string) || "",
      entityId: (r.entity_id as string) || "",
      changesJson: (r.changes_json as string) || "",
    }));

    return NextResponse.json({
      ok: true,
      count: recent.length,
      total: all.length,
      entries: recent,
    });
  } catch (err) {
    console.error("Audit log fetch failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
