/**
 * Auth.js v5 (NextAuth) configuration.
 *
 * Single source of truth for authentication. Imported by the API route
 * handler at /app/api/auth/[...nextauth]/route.ts and by server components
 * that need to read the current user (e.g. middleware, server actions).
 *
 * Why JWT strategy (not database):
 *   - We don't have a backend database — Sheets IS our database
 *   - JWT lets us put the Google OAuth access_token + refresh_token
 *     directly into the session, so server-side Sheets/Drive calls
 *     can authenticate as the user without an extra database lookup
 *   - Token refresh happens automatically in the jwt callback below
 *
 * Why these scopes:
 *   - openid + email + profile  → standard sign-in identity
 *   - drive.file                → access ONLY files WORKMANIS creates
 *                                 or the user explicitly opens via Picker.
 *                                 Critically narrower than full 'drive'
 *                                 — we cannot see the user's other docs.
 *   - spreadsheets              → read/write Sheets we own
 */

import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";

const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
  // Gmail read access for the 'Automātiskie & Internetā' feature.
  // Read-only — we only search and read message bodies/attachments,
  // never send or modify. User must reconsent on first login after
  // deploy because this is a new scope on top of the existing two.
  "https://www.googleapis.com/auth/gmail.readonly",
].join(" ");

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          scope: GOOGLE_SCOPES,
          // Force consent screen so we always get a refresh_token on first
          // login (Google omits it on subsequent logins otherwise)
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    /**
     * Persist OAuth tokens onto the JWT. Called on sign-in (with `account`)
     * and on every subsequent request (without `account` — token already set).
     *
     * Refresh logic: if the access token expired, exchange the refresh_token
     * for a new access_token. Refresh failures bubble up to the session
     * callback as `error: "RefreshAccessTokenError"` so the client can
     * trigger a re-login.
     */
    async jwt({ token, account }) {
      // Initial sign-in — copy tokens from `account` onto `token`
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at, // unix seconds
        };
      }

      // Subsequent requests — check if access token still valid
      const expiresAt = (token as { expiresAt?: number }).expiresAt;
      if (expiresAt && Date.now() < expiresAt * 1000 - 60_000) {
        // Token still valid (with 60s buffer for clock skew)
        return token;
      }

      // Token expired — try refresh
      try {
        const refreshToken = (token as { refreshToken?: string }).refreshToken;
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
          // refresh_token is rotated only sometimes; keep the old one if
          // Google didn't return a new one
          refreshToken: refreshed.refresh_token ?? refreshToken,
        };
      } catch (error) {
        console.error("Token refresh failed:", error);
        return { ...token, error: "RefreshAccessTokenError" };
      }
    },

    /**
     * Expose the access token + any refresh error to the client/server
     * session object. Server components can call `auth()` to get this.
     */
    async session({ session, token }) {
      const t = token as {
        accessToken?: string;
        error?: string;
      };
      return {
        ...session,
        accessToken: t.accessToken,
        error: t.error,
      };
    },
  },
  pages: {
    signIn: "/login",
  },
});

// Type augmentation — declare the extra fields we put on Session
declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: string;
    user: DefaultSession["user"];
  }
}
