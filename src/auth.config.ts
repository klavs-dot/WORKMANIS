/**
 * Auth.js v5 — edge-safe configuration.
 *
 * This file contains everything that runs in BOTH the edge
 * runtime (middleware) AND the Node.js runtime (API routes,
 * server actions). It explicitly DOES NOT include the
 * Credentials provider, because that provider needs to call
 * external-users-login which uses bcrypt + googleapis —
 * neither of which works in edge.
 *
 * The full auth.ts imports this config and adds Credentials
 * on top of it. Middleware imports auth from auth.ts indirectly
 * via the edge-safe config here — it never executes the
 * Credentials authorize() function (that only runs during
 * sign-in, which is a Node.js API route handler).
 *
 * Reference: https://authjs.dev/guides/edge-compatibility
 */

import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
].join(" ");

export type SessionRole = "owner" | "accountant" | "warehouse_manager";

export default {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          scope: GOOGLE_SCOPES,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
    // Credentials provider is in auth.ts (Node.js only)
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, user }) {
      // Initial sign-in via Google — owner role
      if (account?.provider === "google") {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
          role: "owner",
          ownerEmail: token.email,
          allowedCompanyIds: [],
        };
      }

      // Initial sign-in via Credentials — external user
      // (the actual validation happens in auth.ts; here we
      // just propagate the user object fields onto the JWT)
      if (account?.provider === "external" && user) {
        const u = user as unknown as {
          role: SessionRole;
          ownerEmail: string;
          allowedCompanyIds: string[];
        };
        return {
          ...token,
          role: u.role,
          ownerEmail: u.ownerEmail,
          allowedCompanyIds: u.allowedCompanyIds,
          accessToken: undefined,
          refreshToken: undefined,
        };
      }

      const t = token as {
        expiresAt?: number;
        refreshToken?: string;
        role?: SessionRole;
      };

      // External users — no Google token to refresh
      if (t.role && t.role !== "owner") return token;

      const expiresAt = t.expiresAt;
      if (expiresAt && Date.now() < expiresAt * 1000 - 60_000) {
        return token;
      }

      try {
        const refreshToken = t.refreshToken;
        if (!refreshToken) throw new Error("Missing refresh token");

        const response = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: process.env.AUTH_GOOGLE_ID!,
            client_secret: process.env.AUTH_GOOGLE_SECRET!,
            grant_type: "refresh_token",
            refresh_token: refreshToken,
          }),
        });

        const refreshed = await response.json();
        if (!response.ok) throw refreshed;

        return {
          ...token,
          accessToken: refreshed.access_token,
          expiresAt: Math.floor(Date.now() / 1000) + refreshed.expires_in,
          refreshToken: refreshed.refresh_token ?? refreshToken,
        };
      } catch (error) {
        console.error("Token refresh failed:", error);
        return { ...token, error: "RefreshAccessTokenError" };
      }
    },

    async session({ session, token }) {
      const t = token as {
        accessToken?: string;
        error?: string;
        role?: SessionRole;
        ownerEmail?: string;
        allowedCompanyIds?: string[];
      };
      return {
        ...session,
        accessToken: t.accessToken,
        error: t.error,
        role: t.role ?? "owner",
        ownerEmail: t.ownerEmail,
        allowedCompanyIds: t.allowedCompanyIds ?? [],
      };
    },
  },
  pages: {
    signIn: "/login",
  },
} satisfies NextAuthConfig;

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: string;
    role?: SessionRole;
    ownerEmail?: string;
    allowedCompanyIds?: string[];
  }
}
