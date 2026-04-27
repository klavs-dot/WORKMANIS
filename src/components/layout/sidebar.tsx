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
  items: NavItem[];
}

// Three visually separated blocks with a blank line between them.
// Content per the user's spec:
//   1) Company context
//   2) Financial & operational workflows
//   3) Relationships & external partners
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
    items: [
      { href: "/demo", label: "Demo produkcija", icon: Boxes },
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

              {/* Cyan horizontal scanline that sweeps top → bottom.
                  Classic CRT/VHS glitch hint without going overboard. */}
              <motion.rect
                x="0"
                width="80"
                height="2.5"
                fill="#22d3ee"
                opacity="0.55"
                animate={{ y: [-5, 95, -5] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: "linear" }}
              />

              {/* Magenta scanline going the other direction at a
                  different speed — they cross over each other and
                  produce that 'broken signal' feel */}
              <motion.rect
                x="0"
                width="80"
                height="1.5"
                fill="#f472b6"
                opacity="0.45"
                animate={{ y: [95, -5, 95] }}
                transition={{ duration: 4.7, repeat: Infinity, ease: "linear" }}
              />

              {/* Three short horizontal 'tear' bars that flicker on
                  and off at random offsets — looks like the image
                  is breaking up briefly. Each one is a separate
                  motion.rect with its own timing so they never sync. */}
              <motion.rect
                x="8" y="28" width="22" height="1.2" fill="#22d3ee" opacity="0.6"
                animate={{ opacity: [0, 0.6, 0, 0, 0.4, 0], x: [8, 12, 8, 8, 6, 8] }}
                transition={{ duration: 2.1, repeat: Infinity, times: [0, 0.05, 0.1, 0.5, 0.55, 0.6] }}
              />
              <motion.rect
                x="42" y="58" width="30" height="0.8" fill="#f472b6" opacity="0.6"
                animate={{ opacity: [0, 0, 0.7, 0, 0, 0.5, 0], x: [42, 42, 38, 42, 42, 46, 42] }}
                transition={{ duration: 3.3, repeat: Infinity, times: [0, 0.3, 0.32, 0.36, 0.7, 0.72, 0.76] }}
              />
              <motion.rect
                x="14" y="74" width="40" height="1" fill="#a78bfa" opacity="0.5"
                animate={{ opacity: [0, 0, 0, 0.6, 0, 0, 0.5, 0] }}
                transition={{ duration: 2.7, repeat: Infinity, times: [0, 0.2, 0.4, 0.42, 0.45, 0.7, 0.72, 0.75] }}
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
          <ul
            key={groupIdx}
            className={cn(
              "space-y-0.5",
              // Spacer between groups — first group has no top margin,
              // subsequent groups are pushed down with a subtle divider
              // that reads as a breathing space rather than a hard rule.
              groupIdx > 0 &&
                "mt-4 pt-4 border-t border-graphite-200/40"
            )}
          >
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
