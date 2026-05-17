"use client";

/**
 * Global error boundary for the entire app.
 *
 * Catches any uncaught exception from a route segment that doesn't
 * have its own error.tsx. Renders a Latvian message + Reset / Home
 * buttons instead of the default Next.js white screen with
 * "Application error: a client-side exception has occurred".
 *
 * Per Next.js convention this file MUST live at src/app/error.tsx
 * and MUST be a client component — server-component errors fall
 * through to global-error.tsx.
 */

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Vercel function logs catch this server-side; the client console
    // catches it here for local debug.
    console.error("[app/error] Uncaught route error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="max-w-lg w-full p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-[16px] font-semibold tracking-tight text-graphite-900">
              Radusies neparedzēta kļūda
            </h2>
            <p className="mt-1.5 text-[13px] text-graphite-600 leading-relaxed">
              Šajā lapā kaut kas nogāja greizi. Lielākoties palīdz mēģināt
              vēlreiz — ja problēma turpinās, atgriezies uz sākumu un mēģini
              vēlāk.
            </p>
            {error.digest && (
              <p className="mt-2 text-[11px] font-mono text-graphite-500">
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
                <Home className="h-3.5 w-3.5" />
                Atgriezties uz sākumu
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
