/**
 * NextAuth catch-all route handler.
 *
 * Auth.js v5 exports `handlers` object from the central /auth.ts config.
 * Re-export GET and POST from there so Next.js App Router picks them up.
 */

import { handlers } from "@/auth";

export const { GET, POST } = handlers;
