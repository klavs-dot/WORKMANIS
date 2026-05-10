/**
 * /gramatvediba — login route for accountants.
 *
 * Same login flow as /atbildigais but the post-login destination
 * is the dashboard instead of /noliktava (accountants see all
 * companies and need full read access).
 */

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Card } from "@/components/ui/card";
import { GramatvedibaLoginForm } from "./gramatvediba-login-form";

export default async function GramatvedibaLoginPage() {
  const session = await auth();
  if (session?.user && session.role === "accountant") {
    redirect("/parskats");
  }
  if (session?.user && session.role === "owner") {
    redirect("/parskats");
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
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
          <h1 className="text-xl font-semibold text-graphite-900">
            Grāmatvedības pieeja
          </h1>
          <p className="mt-1 text-sm text-graphite-500">
            Ielogojies ar e-pastu un paroli, ko Tev iedeva uzņēmuma
            īpašnieks. Tu redzēsi pilnu uzņēmuma uzskaiti — visus
            uzņēmumus un dokumentus.
          </p>
        </div>

        <GramatvedibaLoginForm />
      </Card>
    </div>
  );
}
