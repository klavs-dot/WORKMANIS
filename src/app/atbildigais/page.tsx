/**
 * /atbildigais — login route for warehouse managers.
 *
 * External users (added by an owner via /noliktavas-atbildigie)
 * log in here with their email + the password the owner gave
 * them, plus the owner's email so we know which Drive hierarchy
 * to authenticate against.
 *
 * After successful login, the user is redirected to /noliktava.
 * Middleware then enforces the role-aware page scoping —
 * warehouse_manager can only see Noliktava / Demo produkcija /
 * Gatavā produkcija pages.
 *
 * Server component renders the login card; the form itself is
 * client-side because it calls signIn('external', ...) which
 * is a client-side helper from next-auth/react.
 */

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Card } from "@/components/ui/card";
import { AtbildigaisLoginForm } from "./atbildigais-login-form";

export default async function AtbildigaisLoginPage() {
  const session = await auth();

  // Already signed in as a warehouse manager → straight to noliktava
  if (session?.user && session.role === "warehouse_manager") {
    redirect("/noliktava");
  }
  // Owner already signed in → owner doesn't need to log in here
  if (session?.user && session.role === "owner") {
    redirect("/noliktava");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-subtle bg-grain px-6">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <div className="flex justify-center mb-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-graphite-900 shadow-soft-sm">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-6 w-6 text-white"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M3 7l9-4 9 4-9 4-9-4z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M3 12l9 4 9-4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M3 17l9 4 9-4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
          <h1 className="text-xl font-semibold text-graphite-900">
            Noliktavas atbildīgais
          </h1>
          <p className="mt-1 text-sm text-graphite-500">
            Ielogojies ar e-pastu un paroli, ko Tev iedeva uzņēmuma
            īpašnieks.
          </p>
        </div>

        <AtbildigaisLoginForm />
      </Card>
    </div>
  );
}
