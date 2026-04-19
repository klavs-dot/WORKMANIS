/**
 * Login page — sign in with Google.
 *
 * Server component that redirects already-authenticated users straight
 * to the company selector. Renders a single CTA otherwise.
 */

import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-subtle bg-grain px-6">
      <Card className="w-full max-w-md p-8 text-center">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-graphite-900 shadow-soft-sm">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-6 w-6 text-white"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4 8L12 3L20 8V16L12 21L4 16V8Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path
                d="M4 8L12 13M12 13L20 8M12 13V21"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        <h1 className="text-[24px] font-semibold tracking-tight text-graphite-900 mb-2">
          WORKMANIS
        </h1>
        <p className="text-[13px] text-graphite-500 mb-8 leading-relaxed">
          Pierakstieties ar Google, lai sāktu pārvaldīt savus uzņēmumus.
          Visi dati glabājas jūsu Google Drive un Sheets — mēs neredzam
          jūsu informāciju.
        </p>

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <Button type="submit" size="lg" className="w-full">
            <GoogleIcon />
            Pierakstīties ar Google
          </Button>
        </form>

        <p className="mt-6 text-[11px] text-graphite-400 leading-relaxed">
          Pierakstoties piekrītat, ka WORKMANIS izveidos savu Google Drive
          mapi un Sheets failus jūsu kontā. Piekļuve tiek dota tikai šiem
          failiem — pārējos dokumentus mēs neredzam.
        </p>
      </Card>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
