/**
 * Auth.js v5 — full configuration (Node.js runtime).
 *
 * Extends auth.config.ts (the edge-safe base) by adding the
 * Credentials provider with a real authorize() that talks to
 * Sheets via service account. This file imports googleapis and
 * bcrypt — must never be imported from middleware.
 *
 * Middleware uses auth.config.ts directly (without authorize).
 * API routes and server components use auth() from this file.
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import authConfig, { type SessionRole } from "./auth.config";

export type { SessionRole };

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
    Credentials({
      id: "external",
      name: "External user",
      credentials: {
        email: { label: "E-pasts", type: "email" },
        password: { label: "Parole", type: "password" },
        ownerEmail: { label: "Uzņēmuma e-pasts", type: "email" },
      },
      async authorize(credentials) {
        try {
          const email = (credentials?.email as string | undefined)?.trim();
          const password =
            (credentials?.password as string | undefined) ?? "";
          const ownerEmail = (
            credentials?.ownerEmail as string | undefined
          )?.trim();

          // Redact PII in logs — keep enough to debug auth flows
          // without leaking full email addresses in aggregated logs.
          const redact = (s: string) => {
            const [local, domain] = s.split("@");
            if (!domain) return "***";
            return `${local.slice(0, 2)}***@${domain}`;
          };

          if (!email || !password || !ownerEmail) {
            console.warn("[auth/external] missing field");
            return null;
          }

          const { validateExternalUserLogin } = await import(
            "@/lib/external-users-login"
          );
          const result = await validateExternalUserLogin({
            email,
            password,
            ownerEmail,
          });
          if (!result) {
            console.warn(
              `[auth/external] validation failed for ${redact(email)}`
            );
            return null;
          }

          console.log(
            `[auth/external] OK ${redact(email)} role=${result.role}`
          );

          return {
            id: result.id,
            email: result.email,
            name: result.email,
            role: result.role,
            ownerEmail: result.ownerEmail,
            allowedCompanyIds: result.allowedCompanyIds,
          } as unknown as { id: string; email: string; name: string };
        } catch (err) {
          // CRITICAL: never let authorize throw — Auth.js v5
          // catches throws here and reports as 'Configuration'
          // server error which is opaque and hard to debug.
          // Logging + return null gives the user a normal
          // 'invalid credentials' UX without the scary error
          // page.
          console.error("[auth/external] authorize crashed:", err);
          return null;
        }
      },
    }),
  ],
});
