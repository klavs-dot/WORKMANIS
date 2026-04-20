/**
 * POST /api/companies/create
 *
 * Creates a new company:
 *   - Provisions Drive folders + company.gsheet + account-master entry
 *   - Returns the new company's metadata for the client to update
 *     its local state (sidebar, /uznemumi page)
 *
 * Requires authenticated session. Uses the user's OAuth access token
 * to perform all Drive + Sheets operations — files are owned by the
 * user, not by WORKMANIS.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  provisionCompany,
  ProvisioningError,
  type CompanyRequisites,
} from "@/lib/provisioning";

export async function POST(request: Request) {
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
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const requisites = validateRequisites(body);
  if (!requisites) {
    return NextResponse.json(
      {
        error:
          "Missing required fields. Must provide: name, legal_name, reg_number",
      },
      { status: 400 }
    );
  }

  try {
    const result = await provisionCompany(
      {
        accessToken: session.accessToken,
        userEmail: session.user.email,
      },
      requisites
    );

    return NextResponse.json({
      ok: true,
      company: {
        id: result.accountMasterCompanyId,
        slug: result.slug,
        folderId: result.folderId,
        sheetId: result.sheetId,
        name: requisites.name,
        legalName: requisites.legal_name,
        regNumber: requisites.reg_number,
        vatNumber: requisites.vat_number ?? null,
      },
    });
  } catch (err) {
    console.error("Company provisioning failed:", err);
    const message =
      err instanceof ProvisioningError
        ? `${err.message}: ${
            err.cause instanceof Error ? err.cause.message : String(err.cause)
          }`
        : err instanceof Error
          ? err.message
          : "Unknown error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

/**
 * Validate and narrow request body into a CompanyRequisites.
 * Returns null if required fields missing or wrong type.
 */
function validateRequisites(body: unknown): CompanyRequisites | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  const required = ["name", "legal_name", "reg_number"] as const;
  for (const key of required) {
    if (typeof b[key] !== "string" || !(b[key] as string).trim()) {
      return null;
    }
  }

  // Optional fields — allow strings or undefined, reject other types
  const optional = [
    "vat_number",
    "address",
    "iban",
    "bic",
    "phone",
    "email",
    "website",
    "director_name",
    "director_position",
  ] as const;
  for (const key of optional) {
    if (b[key] !== undefined && typeof b[key] !== "string") {
      return null;
    }
  }

  return {
    name: (b.name as string).trim(),
    legal_name: (b.legal_name as string).trim(),
    reg_number: (b.reg_number as string).trim(),
    vat_number: (b.vat_number as string | undefined)?.trim(),
    address: (b.address as string | undefined)?.trim(),
    iban: (b.iban as string | undefined)?.trim(),
    bic: (b.bic as string | undefined)?.trim(),
    phone: (b.phone as string | undefined)?.trim(),
    email: (b.email as string | undefined)?.trim(),
    website: (b.website as string | undefined)?.trim(),
    director_name: (b.director_name as string | undefined)?.trim(),
    director_position: (b.director_position as string | undefined)?.trim(),
  };
}
