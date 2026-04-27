"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
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
  IdCard,
  Warehouse,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/lib/notifications";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  /** Optional section title shown above the items. When omitted,
   *  the group renders as a quiet block separated only by a divider. */
  label?: string;
  items: NavItem[];
}

// Visually separated blocks. Groups with a `label` get a small uppercase
// header above them; groups without just sit inside dividers.
//   1) Company context
//   2) Financial & operational workflows
//   3) Production (warehouse, demo, finished goods)
//   4) Relationships & external partners
const navGroups: NavGroup[] = [
  {
    items: [
      { href: "/uznemumi", label: "Uzņēmumi / Struktūrvienības", icon: Building2 },
      { href: "/parskats", label: "Pārskats", icon: LayoutDashboard },
    ],
  },
  {
    items: [
      { href: "/rekini", label: "Rēķini & Maksājumi", icon: FileText },
      { href: "/gramatvedibai", label: "Grāmatvedībai & Lietvedībai", icon: Calculator },
      { href: "/aktivi", label: "Aktīvi", icon: Package },
      { href: "/darbinieki", label: "Darbinieki", icon: IdCard },
    ],
  },
  {
    label: "Produkcija",
    items: [
      { href: "/noliktava", label: "Noliktava", icon: Warehouse },
      { href: "/demo", label: "Demo produkcija", icon: Boxes },
      { href: "/gatava-produkcija", label: "Gatavā produkcija", icon: Sparkles },
    ],
  },
  {
    items: [
      { href: "/distributori", label: "Distributori & Aģenti", icon: Handshake },
      { href: "/partneri", label: "Iepirkumi", icon: Briefcase },
      { href: "/klienti", label: "Klienti & Partneri", icon: Users },
    ],
  },
];

const bottomNav: NavItem[] = [
  { href: "/iestatijumi", label: "Iestatījumi", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const notifications = useNotifications();

  // Map href → notification count. Only non-zero values produce a badge.
  const badgeFor = (href: string): number => {
    if (href === "/rekini") return notifications.rekini;
    if (href === "/darbinieki") return notifications.darbinieki;
    if (href === "/aktivi") return notifications.aktivi;
    return 0;
  };

  return (
    <aside className="hidden lg:flex w-[240px] shrink-0 flex-col border-r border-graphite-100 bg-surface-subtle">
      {/* Brand */}
      <div className="flex h-20 items-center gap-3 px-5 border-b border-graphite-100">
        <motion.div
          animate={{ y: [0, -3, 0] }}
          transition={{
            duration: 1.6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="flex h-16 w-16 items-center justify-center shrink-0"
        >
          <svg
            viewBox="0 0 80 95"
            fill="none"
            className="h-16 w-16 overflow-visible"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              {/* Clip the glitch background to a rounded rect so it
                  doesn't bleed past the icon's intended bounds */}
              <clipPath id="sidebar-robot-glitch-clip">
                <rect x="0" y="0" width="80" height="95" rx="10" />
              </clipPath>
              {/* Subtle radial gradient — gives the background just
                  enough lift so the glitch lines have something to
                  layer on top of, without making the icon feel boxy */}
              <radialGradient id="sidebar-robot-bg-grad" cx="0.5" cy="0.45" r="0.7">
                <stop offset="0%" stopColor="#e0e7ff" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#f1f5f9" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Glitch background — clipped so it stays within the
                logo footprint. Bands and noise sit BEHIND the robot. */}
            <g clipPath="url(#sidebar-robot-glitch-clip)">
              {/* Soft bg gradient halo */}
              <rect x="0" y="0" width="80" height="95" fill="url(#sidebar-robot-bg-grad)" />

              {/* Glitch tear bars — random horizontal flashes that
                  briefly displace and flicker. No sweeping scanlines
                  per user request; just punchy intermittent breakup.
                  Each bar has its own duration and timing offsets so
                  they never sync, giving real 'random corruption'
                  feel. Heights, widths, and Y positions chosen to
                  spread the action across the icon's full vertical. */}
              <motion.rect
                x="6" y="18" width="32" height="3" fill="#22d3ee"
                animate={{
                  opacity: [0, 0.85, 0, 0, 0.7, 0, 0],
                  x: [6, 14, 6, 6, 2, 6, 6],
                }}
                transition={{
                  duration: 1.6,
                  repeat: Infinity,
                  times: [0, 0.04, 0.1, 0.45, 0.5, 0.55, 1],
                }}
              />
              <motion.rect
                x="38" y="32" width="38" height="2.5" fill="#f472b6"
                animate={{
                  opacity: [0, 0, 0.9, 0, 0, 0.75, 0, 0],
                  x: [38, 38, 30, 38, 38, 44, 38, 38],
                }}
                transition={{
                  duration: 2.1,
                  repeat: Infinity,
                  times: [0, 0.2, 0.23, 0.3, 0.6, 0.63, 0.7, 1],
                }}
              />
              <motion.rect
                x="2" y="50" width="48" height="2" fill="#a78bfa"
                animate={{
                  opacity: [0, 0.8, 0, 0, 0, 0.7, 0],
                  x: [2, -4, 2, 2, 2, 8, 2],
                }}
                transition={{
                  duration: 1.9,
                  repeat: Infinity,
                  times: [0, 0.06, 0.12, 0.4, 0.7, 0.74, 0.8],
                }}
              />
              <motion.rect
                x="44" y="64" width="34" height="3" fill="#22d3ee"
                animate={{
                  opacity: [0, 0, 0, 0.85, 0, 0, 0.7, 0],
                  x: [44, 44, 44, 50, 44, 44, 38, 44],
                }}
                transition={{
                  duration: 2.4,
                  repeat: Infinity,
                  times: [0, 0.15, 0.3, 0.32, 0.4, 0.7, 0.73, 0.8],
                }}
              />
              <motion.rect
                x="10" y="78" width="44" height="2.5" fill="#f472b6"
                animate={{
                  opacity: [0, 0, 0.85, 0, 0, 0, 0.7, 0],
                  x: [10, 10, 4, 10, 10, 10, 16, 10],
                }}
                transition={{
                  duration: 1.7,
                  repeat: Infinity,
                  times: [0, 0.25, 0.28, 0.35, 0.55, 0.85, 0.88, 0.95],
                }}
              />
              <motion.rect
                x="20" y="90" width="40" height="2" fill="#a78bfa"
                animate={{
                  opacity: [0, 0, 0, 0, 0.8, 0, 0],
                  x: [20, 20, 20, 20, 26, 20, 20],
                }}
                transition={{
                  duration: 2.2,
                  repeat: Infinity,
                  times: [0, 0.2, 0.4, 0.5, 0.55, 0.65, 1],
                }}
              />
            </g>

            {/* Antenna */}
            <line
              x1="40"
              y1="14"
              x2="40"
              y2="22"
              stroke="#475569"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <motion.circle
              cx="40"
              cy="11"
              r="4"
              fill="#8b5cf6"
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.7, 1, 0.7],
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />

            {/* Head */}
            <rect x="20" y="22" width="40" height="32" rx="6" fill="#1e293b" />

            {/* Eyes — blink occasionally */}
            <motion.g
              animate={{ scaleY: [1, 1, 0.1, 1, 1] }}
              transition={{
                duration: 4,
                repeat: Infinity,
                times: [0, 0.85, 0.9, 0.95, 1],
                ease: "easeInOut",
              }}
              style={{ transformOrigin: "40px 36px" }}
            >
              <circle cx="31" cy="36" r="4" fill="#34d399" />
              <circle cx="49" cy="36" r="4" fill="#34d399" />
            </motion.g>

            {/* Mouth */}
            <path
              d="M 31 46 Q 40 50 49 46"
              stroke="#cbd5e1"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />

            {/* Left arm — waves */}
            <motion.g
              style={{ transformOrigin: "24px 60px" }}
              animate={{ rotate: [-15, 15, -15] }}
              transition={{
                duration: 1.4,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <line
                x1="24"
                y1="60"
                x2="13"
                y2="68"
                stroke="#475569"
                strokeWidth="2.8"
                strokeLinecap="round"
              />
              <circle cx="12" cy="69" r="2.8" fill="#1e293b" />
            </motion.g>

            {/* Right arm — waves opposite */}
            <motion.g
              style={{ transformOrigin: "56px 60px" }}
              animate={{ rotate: [15, -15, 15] }}
              transition={{
                duration: 1.4,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <line
                x1="56"
                y1="60"
                x2="67"
                y2="68"
                stroke="#475569"
                strokeWidth="2.8"
                strokeLinecap="round"
              />
              <circle cx="68" cy="69" r="2.8" fill="#1e293b" />
            </motion.g>

            {/* Body */}
            <rect x="24" y="57" width="32" height="22" rx="3" fill="#334155" />

            {/* Chest light */}
            <motion.circle
              cx="40"
              cy="68"
              r="3"
              fill="#f59e0b"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1, repeat: Infinity }}
            />

            {/* Legs */}
            <rect x="29" y="79" width="6" height="11" rx="1.5" fill="#1e293b" />
            <rect x="45" y="79" width="6" height="11" rx="1.5" fill="#1e293b" />
          </svg>
        </motion.div>
        <div className="flex flex-col leading-none">
          <span className="text-[21px] font-semibold tracking-tight text-graphite-900">
            WORKMANIS
          </span>
          <span className="text-[10.5px] text-graphite-400 mt-1">
            Komandcentrs. Seko biznesam.
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

        {navGroups.map((group, groupIdx) => (
          <div
            key={groupIdx}
            className={cn(
              groupIdx > 0 && "mt-4 pt-4 border-t border-graphite-200/40"
            )}
          >
            {group.label && (
              <div className="px-2 mb-2">
                <span className="text-[10.5px] font-medium uppercase tracking-wider text-graphite-400">
                  {group.label}
                </span>
              </div>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                const Icon = item.icon;
                const badgeCount = badgeFor(item.href);
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
                      {badgeCount > 0 && (
                        <span
                          className={cn(
                            "flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular",
                            isActive
                              ? "bg-red-600 text-white"
                              : "bg-red-50 text-red-600 border border-red-100"
                          )}
                      >
                        {badgeCount}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          </div>
        ))}
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
