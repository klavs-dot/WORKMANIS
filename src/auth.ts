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
        const email = (credentials?.email as string | undefined)?.trim();
        const password = (credentials?.password as string | undefined) ?? "";
        const ownerEmail = (
          credentials?.ownerEmail as string | undefined
        )?.trim();

        if (!email || !password || !ownerEmail) {
          throw new Error(
            "Aizpildi visus laukus: e-pasts, parole, uzņēmuma e-pasts"
          );
        }

        // Dynamic import — keeps googleapis/bcrypt out of the
        // initial auth.ts module graph, so edge bundles that
        // import auth.config don't even transitively touch them.
        const { validateExternalUserLogin } = await import(
          "@/lib/external-users-login"
        );
        const result = await validateExternalUserLogin({
          email,
          password,
          ownerEmail,
        });
        if (!result) {
          throw new Error(
            "Nepareizs e-pasts vai parole. Pārbaudi, ka uzņēmuma e-pasts ir pareizs."
          );
        }

        return {
          id: result.id,
          email: result.email,
          name: result.email,
          role: result.role,
          ownerEmail: result.ownerEmail,
          allowedCompanyIds: result.allowedCompanyIds,
        } as unknown as { id: string; email: string; name: string };
      },
    }),
  ],
});
