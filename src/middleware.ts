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
 * Role scoping:
 *   warehouse_manager → only /noliktava, /demo-produkcija,
 *                       /gatava-produkcija, /api/*
 *   accountant + owner → all pages
 */

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "./auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login", "/atbildigais", "/gramatvediba"];

const WAREHOUSE_MANAGER_ALLOWED_PREFIXES = [
  "/noliktava",
  "/demo-produkcija",
  "/gatava-produkcija",
];

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
  if (role === "warehouse_manager") {
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
