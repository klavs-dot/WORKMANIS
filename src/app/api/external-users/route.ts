/**
 * /api/external-users
 *
 *   GET    → list non-deleted external users for the owner
 *   POST   → create a new external user, returns plaintext
 *            password for one-time delivery to that user
 *   DELETE → soft-delete (?id=ext-...)
 *   PATCH  → update allowed_company_ids (body: { id, allowedCompanyIds })
 *
 * Auth: requires a valid owner session (Google OAuth). External
 * users themselves don't get to call this — only the owner who
 * is granting access.
 *
 * Sesija 7 — first half of the accountant/warehouse-manager
 * back-door auth feature. This commit handles the management UI
 * (list/add/remove). The login flow for the external users
 * themselves comes in a follow-up.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  listExternalUsers,
  createExternalUser,
  deleteExternalUser,
  updateAllowedCompanies,
  generatePassword,
  type ExternalUserRole,
} from "@/lib/external-users-store";

export const maxDuration = 30;

export async function GET() {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  try {
    const users = await listExternalUsers(
      session.accessToken,
      session.user.email
    );
    return NextResponse.json({ users });
  } catch (err) {
    console.error("List external users failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }
  if (session.role !== "owner") {
    return NextResponse.json(
      { error: "Only the owner may manage external users" },
      { status: 403 }
    );
  }

  let body: {
    email?: string;
    password?: string;
    role?: ExternalUserRole;
    allowedCompanyIds?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim();
  const role = body.role;
  if (!email) {
    return NextResponse.json(
      { error: "Missing email" },
      { status: 400 }
    );
  }
  if (role !== "accountant" && role !== "warehouse_manager") {
    return NextResponse.json(
      { error: "Role must be 'accountant' or 'warehouse_manager'" },
      { status: 400 }
    );
  }

  // Auto-generate password if not supplied. Always show the
  // plaintext password back to the owner exactly once — this is
  // the only chance to deliver it to the external user.
  const plaintextPassword = body.password?.trim() || generatePassword();

  try {
    const user = await createExternalUser(
      session.accessToken,
      session.user.email,
      {
        email,
        password: plaintextPassword,
        role,
        allowedCompanyIds: body.allowedCompanyIds ?? [],
      }
    );
    return NextResponse.json({
      user,
      plaintextPassword,
      // Reminder for the owner UI to show this password once and
      // never re-fetch it (we've already hashed and discarded it
      // on the server side). The plaintext is in the API response
      // body and not stored anywhere else.
      warning:
        "Šī parole tiks rādīta TIKAI vienreiz. Saglabā to droši un nodod grāmatvedei / atbildīgajam.",
    });
  } catch (err) {
    console.error("Create external user failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }
  if (session.role !== "owner") {
    return NextResponse.json(
      { error: "Only the owner may manage external users" },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    await deleteExternalUser(
      session.accessToken,
      session.user.email,
      id
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete external user failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }
  if (session.role !== "owner") {
    return NextResponse.json(
      { error: "Only the owner may manage external users" },
      { status: 403 }
    );
  }

  let body: { id?: string; allowedCompanyIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = body.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  if (!Array.isArray(body.allowedCompanyIds)) {
    return NextResponse.json(
      { error: "allowedCompanyIds must be an array" },
      { status: 400 }
    );
  }

  try {
    await updateAllowedCompanies(
      session.accessToken,
      session.user.email,
      id,
      body.allowedCompanyIds
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Update external user failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update" },
      { status: 500 }
    );
  }
}
