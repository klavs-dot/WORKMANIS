/**
 * Shared nav structure consumed by both the desktop <Sidebar /> and
 * the mobile <MobileNav /> drawer. Single source of truth so adding
 * a route only touches one file.
 *
 * Visual groups (in display order):
 *   1) Company context        — /uznemumi, /parskats
 *   2) Financial/operational  — /rekini, /gramatvedibai, /aktivi,
 *                                /darbinieki
 *   3) Production (warehouse) — /noliktava, /demo, /gatava-produkcija,
 *                                /noliktavas-atbildigie
 *   4) Relationships          — /distributori, /partneri, /klienti
 */

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
  Bug,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  /** Optional uppercase section header above the items. */
  label?: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
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
    label: "Noliktava",
    items: [
      { href: "/noliktava", label: "Noliktava", icon: Warehouse },
      { href: "/demo", label: "Demo produkcija", icon: Boxes },
      { href: "/gatava-produkcija", label: "Gatavā produkcija", icon: Sparkles },
      { href: "/noliktavas-atbildigie", label: "Noliktavas atbildīgie", icon: Users },
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

export const bottomNav: NavItem[] = [
  { href: "/iestatijumi", label: "Iestatījumi", icon: Settings },
  { href: "/debug-log", label: "Diagnostika", icon: Bug },
];
