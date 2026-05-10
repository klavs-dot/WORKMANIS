/**
 * Auth.js v5 (NextAuth) configuration.
 *
 * Two providers active simultaneously:
 *   1. Google OAuth — for the OWNER. Gets Drive + Sheets scopes.
 *   2. Credentials — for EXTERNAL USERS (accountants, warehouse
 *      managers) added by the owner. Validated against bcrypt
 *      hashes in account-master.gsheet/02_external_users.
 *
 * Session shape additions for Sesija 7:
 *   role            'owner' | 'accountant' | 'warehouse_manager'
 *   ownerEmail      For owner: their email. For external users:
 *                   the email of the owner whose system they
 *                   were granted access to.
 *   allowedCompanyIds  Empty = all companies. Restricted otherwise.
 *
 * Delegated Sheets access (Faze 2 follow-up): external user
 * sessions don't have Google tokens. Sheets API calls from
 * those sessions need to use the owner's tokens — this is
 * implemented in the API endpoints by looking up the owner
 * via session.ownerEmail.
 */

import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";

const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
].join(" ");

export type SessionRole = "owner" | "accountant" | "warehouse_manager";

export const { handlers, auth, signIn, signOut } = NextAuth({
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

        // Dynamic import to keep googleapis out of edge bundle
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
            "Nepareizs e-pasts vai parole. Pārbaudi ka uzņēmuma e-pasts ir pareizs."
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

      // Initial sign-in via Credentials — external user role
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
});

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: string;
    role?: SessionRole;
    ownerEmail?: string;
    allowedCompanyIds?: string[];
    user: DefaultSession["user"];
  }
}
