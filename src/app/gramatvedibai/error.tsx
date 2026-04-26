"use client";

/**
 * Next.js error boundary for /gramatvedibai route.
 *
 * If anything in the page tree throws during render — bad data,
 * undefined access, malformed dates — Next renders this instead
 * of the default 'Application error' white screen. User sees
 * a Latvian error message and a reset button instead of being
 * stranded.
 *
 * This is route-scoped, not global. Other routes have their own
 * (or fall through to the default).
 */

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function GramatvedibaiError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to whatever error tracker is wired up. For now, just
    // console — Vercel function logs will catch it server-side
    // if it bubbles, and the client console catches it here.
    console.error("Gramatvedibai page error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="max-w-lg w-full p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-[16px] font-semibold tracking-tight text-graphite-900">
              Lapā radusies kļūda
            </h2>
            <p className="mt-1.5 text-[13px] text-graphite-600 leading-relaxed">
              Grāmatvedības lapas ielādē kāds dati nav atrodami vai ir nederīgi.
              Mēģini atjaunot lapu — ja problēma turpinās, sazinies ar mums.
            </p>
            {error.digest && (
              <p className="mt-2 text-[11px] font-mono text-graphite-400">
                Kļūdas kods: {error.digest}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <Button size="sm" onClick={reset}>
                <RefreshCw className="h-3.5 w-3.5" />
                Mēģināt vēlreiz
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => (window.location.href = "/")}
              >
                Atgriezties uz sākumu
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
