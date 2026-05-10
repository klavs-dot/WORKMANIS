/**
 * Auth.js v5 middleware — auth gate + role-aware page scoping.
 *
 * Public paths (no auth required):
 *   /login            → owner Google sign-in
 *   /atbildigais      → warehouse manager login
 *   /gramatvediba     → accountant login
 *   /api/auth/*       → NextAuth callback URLs
 *
 * Role-based page scoping (Sesija 7):
 *   - owner             → all pages
 *   - accountant        → all pages (read-only via API checks; same
 *                         routes as owner so they can audit everything)
 *   - warehouse_manager → only /noliktava, /demo-produkcija,
 *                         /gatava-produkcija, and shared routes
 *                         (logout, profile-ish)
 *
 * When a warehouse_manager tries to access a forbidden page, we
 * redirect to /noliktava (their default landing). This avoids
 * 403-like dead ends.
 *
 * Note: Auth.js v5 middleware is edge-runtime; cannot import
 * server-only libraries here. We do the bare minimum check (role
 * from session.role) and let server components do data-level
 * checks themselves.
 */

import { auth } from "@/auth";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/atbildigais", "/gramatvediba"];

// Pages a warehouse_manager IS allowed to see. Anything not on
// this list (and not under /api/...) gets redirected to /noliktava.
const WAREHOUSE_MANAGER_ALLOWED_PREFIXES = [
  "/noliktava",
  "/demo-produkcija",
  "/gatava-produkcija",
  // Don't allow /noliktavas-atbildigie — that's owner-only
  // management of warehouse manager accounts. A manager
  // shouldn't be adding peers.
];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Allow public paths and NextAuth API routes
  if (
    PUBLIC_PATHS.some(
      (p) => pathname === p || pathname.startsWith(p + "/")
    ) ||
    pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  // No session → bounce to login, preserving intended destination
  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Role-aware scoping for warehouse managers
  const role = (req.auth as { role?: string }).role;
  if (role === "warehouse_manager") {
    // Allow API routes — server-side handlers do their own
    // role checks. Blocking all APIs at the edge would break
    // the warehouse pages they DO need.
    if (pathname.startsWith("/api/")) {
      return NextResponse.next();
    }
    const allowed = WAREHOUSE_MANAGER_ALLOWED_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(p + "/")
    );
    if (!allowed) {
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
