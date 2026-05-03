"use client";

import { ChevronDown, Check } from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCompany } from "@/lib/company-context";
import { buildDriveFileUrl } from "@/lib/drive-files";

/**
 * CompanyAvatar — square 5x5 avatar showing logo if uploaded,
 * initials fallback otherwise. Used both in the active-company
 * trigger and in the dropdown list.
 */
function CompanyAvatar({
  name,
  logoDriveId,
  companyId,
}: {
  name: string;
  logoDriveId?: string;
  companyId: string;
}) {
  if (logoDriveId) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={buildDriveFileUrl(logoDriveId, companyId, "view")}
        alt={name}
        className="h-5 w-5 rounded-md object-cover"
      />
    );
  }
  return (
    <div className="flex h-5 w-5 items-center justify-center rounded-md bg-graphite-900 text-white text-[9px] font-semibold">
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

export function Topbar() {
  const { companies, activeCompany, setActiveCompany } = useCompany();
  const { data: session } = useSession();

  const userName = session?.user?.name ?? "Lietotājs";
  const userEmail = session?.user?.email ?? "";
  const userInitials = (userName || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <header className="sticky top-0 z-30 h-14 glass border-b border-graphite-100">
      <div className="flex h-full items-center gap-3 px-4 lg:px-6">
        <div className="flex items-center gap-1.5 ml-auto">
          {activeCompany && (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 h-9 px-3 rounded-lg border border-graphite-200 bg-white text-[12.5px] font-medium text-graphite-700 hover:border-graphite-300 transition-colors focus:outline-none">
                <CompanyAvatar
                  name={activeCompany.name}
                  logoDriveId={activeCompany.logoDriveId}
                  companyId={activeCompany.id}
                />
                <span className="truncate max-w-[160px]">
                  {activeCompany.name}
                </span>
                <ChevronDown className="h-3 w-3 text-graphite-400" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Pārslēgt uzņēmumu</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {companies.map((c) => (
                  <DropdownMenuItem
                    key={c.id}
                    onSelect={() => setActiveCompany(c.id)}
                  >
                    <CompanyAvatar
                      name={c.name}
                      logoDriveId={c.logoDriveId}
                      companyId={c.id}
                    />
                    <span className="flex-1 truncate">{c.name}</span>
                    {activeCompany.id === c.id && (
                      <Check className="h-3.5 w-3.5" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger className="focus:outline-none">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-graphite-900 text-white text-[11px] font-semibold transition-transform active:scale-95">
                {userInitials || "?"}
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2.5 py-2 border-b border-graphite-100 mb-1">
                <p className="text-[13px] font-medium text-graphite-900 truncate">
                  {userName}
                </p>
                {userEmail && (
                  <p className="text-[11.5px] text-graphite-500 mt-0.5 truncate">
                    {userEmail}
                  </p>
                )}
              </div>
              <DropdownMenuItem>Mans profils</DropdownMenuItem>
              <DropdownMenuItem>Komandas iestatījumi</DropdownMenuItem>
              <DropdownMenuItem>Palīdzība</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  // Sign out via NextAuth and clear local company selection
                  if (typeof window !== "undefined") {
                    window.localStorage.removeItem("workmanis:active-company");
                  }
                  signOut({ redirectTo: "/login" });
                }}
              >
                Atteikties
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
