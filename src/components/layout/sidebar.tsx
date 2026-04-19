"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Building2,
  Settings,
  Package,
  Users,
  Handshake,
  Boxes,
  Briefcase,
  Calculator,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
}

const mainNav: NavItem[] = [
  { href: "/uznemumi", label: "Uzņēmumi / Struktūrvienības", icon: Building2 },
  { href: "/parskats", label: "Pārskats", icon: LayoutDashboard },
  { href: "/rekini", label: "Rēķini & Maksājumi", icon: FileText, badge: "3" },
  { href: "/gramatvedibai", label: "Grāmatvedībai", icon: Calculator },
  { href: "/klienti", label: "Klienti & Partneri", icon: Users },
  { href: "/distributori", label: "Distributori & Aģenti", icon: Handshake },
  { href: "/demo", label: "Demo produkcija", icon: Boxes },
  { href: "/partneri", label: "Partneri / Piegādātāji / Servisi", icon: Briefcase },
  { href: "/aktivi", label: "Aktīvi", icon: Package },
];

const bottomNav: NavItem[] = [
  { href: "/iestatijumi", label: "Iestatījumi", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex w-[240px] shrink-0 flex-col border-r border-graphite-100 bg-surface-subtle">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 px-5 border-b border-graphite-100">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-graphite-900 shadow-soft-xs">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-3.5 w-3.5 text-white"
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
        <div className="flex flex-col leading-none">
          <span className="text-[14px] font-semibold tracking-tight text-graphite-900">
            WORKMANIS
          </span>
          <span className="text-[10.5px] text-graphite-400 mt-0.5">
            Uzņēmumu pārvaldība
          </span>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <div className="px-2 mb-2">
          <span className="text-[10.5px] font-medium uppercase tracking-wider text-graphite-400">
            Galvenā
          </span>
        </div>
        <ul className="space-y-0.5">
          {mainNav.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px] font-medium transition-all",
                    isActive
                      ? "bg-white text-graphite-900 shadow-soft-xs border border-graphite-200/60"
                      : "text-graphite-600 hover:text-graphite-900 hover:bg-white/60"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 transition-colors",
                      isActive
                        ? "text-graphite-900"
                        : "text-graphite-400 group-hover:text-graphite-600"
                    )}
                    strokeWidth={2}
                  />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span
                      className={cn(
                        "flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular",
                        isActive
                          ? "bg-graphite-900 text-white"
                          : "bg-red-50 text-red-600 border border-red-100"
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom */}
      <div className="border-t border-graphite-100 p-3">
        <ul className="space-y-0.5">
          {bottomNav.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px] font-medium transition-all",
                    isActive
                      ? "bg-white text-graphite-900 shadow-soft-xs border border-graphite-200/60"
                      : "text-graphite-600 hover:text-graphite-900 hover:bg-white/60"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4",
                      isActive
                        ? "text-graphite-900"
                        : "text-graphite-400 group-hover:text-graphite-600"
                    )}
                    strokeWidth={2}
                  />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* User card */}
        <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-graphite-200/60 bg-white p-2 shadow-soft-xs">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-graphite-900 text-white text-[11px] font-semibold">
            KB
          </div>
          <div className="flex-1 min-w-0 leading-tight">
            <p className="text-[12.5px] font-medium text-graphite-900 truncate">
              Klāvs Bērziņš
            </p>
            <p className="text-[10.5px] text-graphite-500 truncate">
              Administrators
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
