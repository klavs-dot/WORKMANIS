/**
 * Auth.js v5 middleware — edge-runtime safe.
 *
 * Imports auth.config.ts (edge-safe, no Credentials provider)
 * directly to avoid pulling googleapis/bcrypt into the edge
 * bundle. The Credentials provider only runs during sign-in
 * which is a Node.js API route — the middleware never invokes
 * authorize().
 *
 * Public paths:
 *   /login            → owner Google sign-in
 *   /atbildigais      → warehouse manager login
 *   /gramatvediba     → accountant login
 *   /api/auth/*       → NextAuth callback URLs
 *
 * Role scoping (page paths):
 *   warehouse_manager → only /noliktava, /demo-produkcija,
 *                       /gatava-produkcija (redirected to /noliktava)
 *   accountant        → everything EXCEPT owner-only pages
 *                       (redirected to /parskats)
 *   owner             → all pages
 *
 * Role scoping (API paths):
 *   warehouse_manager → only warehouse APIs + shared owner-info /
 *                       companies/list (needed for ctx)
 *   accountant        → everything EXCEPT owner-only APIs
 *   owner             → all APIs
 *
 * Defence-in-depth: individual route handlers also verify role
 * via session.role checks; this middleware is the first gate.
 */

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "./auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login", "/atbildigais", "/gramatvediba"];

const WAREHOUSE_MANAGER_ALLOWED_PAGE_PREFIXES = [
  "/noliktava",
  "/demo-produkcija",
  "/gatava-produkcija",
];

const WAREHOUSE_MANAGER_ALLOWED_API_PREFIXES = [
  "/api/warehouse",
  "/api/owner-info",
  "/api/companies/list",
  "/api/health",
];

const OWNER_ONLY_PAGE_PREFIXES = [
  "/iestatijumi",
  "/uznemumi",
  "/debug-log",
];

const OWNER_ONLY_API_PREFIXES = [
  "/api/external-users",
  "/api/owner-setup",
  "/api/companies/delete",
  "/api/companies/oauth",
  "/api/companies/repair",
  "/api/companies/schema-check",
  "/api/payments/delete-all",
  "/api/payments/fix-signs",
  "/api/payments/reclassify-all",
  "/api/audit-log",
];

function matchesPrefix(pathname: string, prefixes: readonly string[]) {
  return prefixes.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.some(
      (p) => pathname === p || pathname.startsWith(p + "/")
    ) ||
    pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = (req.auth as { role?: string }).role;
  const isApi = pathname.startsWith("/api/");

  // Owner-only paths/APIs gate first — applies to accountant AND
  // warehouse_manager.
  if (role !== "owner") {
    if (isApi && matchesPrefix(pathname, OWNER_ONLY_API_PREFIXES)) {
      return NextResponse.json(
        { error: "Owner role required" },
        { status: 403 }
      );
    }
    if (!isApi && matchesPrefix(pathname, OWNER_ONLY_PAGE_PREFIXES)) {
      const fallback = role === "warehouse_manager" ? "/noliktava" : "/parskats";
      return NextResponse.redirect(new URL(fallback, req.nextUrl.origin));
    }
  }

  if (role === "warehouse_manager") {
    if (isApi) {
      if (!matchesPrefix(pathname, WAREHOUSE_MANAGER_ALLOWED_API_PREFIXES)) {
        return NextResponse.json(
          { error: "Forbidden for warehouse_manager role" },
          { status: 403 }
        );
      }
      return NextResponse.next();
    }
    if (!matchesPrefix(pathname, WAREHOUSE_MANAGER_ALLOWED_PAGE_PREFIXES)) {
      return NextResponse.redirect(
        new URL("/noliktava", req.nextUrl.origin)
      );
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)",
  ],
};
