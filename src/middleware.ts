/**
 * Auth.js v5 middleware — gates the entire app behind Google sign-in.
 *
 * Public paths (no auth required):
 *   - /login          → sign-in page itself
 *   - /api/auth/*     → NextAuth callback URLs
 *
 * Everything else redirects to /login when no session exists.
 *
 * Note: Auth.js v5 middleware is edge-runtime; cannot import server-only
 * libraries here. We do the bare minimum check (cookie presence via
 * `auth()`) and let server components do data-level checks themselves.
 */

import { auth } from "@/auth";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Allow public paths and NextAuth API routes
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
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

  return NextResponse.next();
});

/**
 * Match all routes EXCEPT static assets, image optimizer, and favicons.
 * The negative lookahead is the recommended Auth.js pattern.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)"],
};
