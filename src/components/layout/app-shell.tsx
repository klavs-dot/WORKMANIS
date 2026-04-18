"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { useCompany } from "@/lib/company-context";

const COMPANY_OPTIONAL_PATHS = ["/uznemumi"];

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { activeCompany, hydrated } = useCompany();

  const isOptional = COMPANY_OPTIONAL_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (hydrated && !activeCompany && !isOptional) {
      router.replace("/");
    }
  }, [hydrated, activeCompany, isOptional, router]);

  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 rounded-full border-2 border-graphite-200 border-t-graphite-900 animate-spin" />
      </div>
    );
  }

  if (!activeCompany && !isOptional) {
    return null;
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1440px] px-4 lg:px-8 py-6 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
