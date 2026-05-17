"use client";

/**
 * Mobile navigation drawer. Mounted in <Topbar /> and only visible
 * when the burger button is rendered (lg:hidden). Uses the shared
 * nav-config so the items match the desktop sidebar exactly.
 *
 * Behaviour:
 *   - Slides in from the LEFT (sidebar lives on the left for desktop)
 *   - Closes on item click via the local close handler
 *   - Closes on backdrop click / Esc (Radix Dialog built-in)
 */

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/lib/notifications";
import { navGroups, bottomNav } from "./nav-config";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const notifications = useNotifications();

  const badgeFor = (href: string): number => {
    if (href === "/rekini") return notifications.rekini;
    if (href === "/darbinieki") return notifications.darbinieki;
    if (href === "/aktivi") return notifications.aktivi;
    return 0;
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-md text-graphite-700 hover:bg-graphite-100 transition-colors focus:outline-none focus:ring-2 focus:ring-graphite-300"
        aria-label="Atvērt izvēlni"
      >
        <Menu className="h-5 w-5" />
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-graphite-900/30 backdrop-blur-[2px]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed top-0 left-0 z-50 h-full w-[280px] bg-surface-subtle border-r border-graphite-200/60 shadow-soft-xl",
            "flex flex-col",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
            "duration-250"
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            Galvenā navigācija
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Pārslēdzieties uz citu sadaļu
          </DialogPrimitive.Description>

          {/* Brand header */}
          <div className="flex h-16 items-center px-5 border-b border-graphite-100">
            <div className="text-[15px] font-semibold tracking-tight text-graphite-900">
              WORKMANIS
            </div>
          </div>

          {/* Primary nav */}
          <nav className="flex-1 overflow-y-auto p-3">
            {navGroups.map((group, groupIdx) => (
              <div
                key={groupIdx}
                className={cn(
                  groupIdx > 0 && "mt-4 pt-4 border-t border-graphite-200/40"
                )}
              >
                {group.label && (
                  <div className="px-2 mb-2">
                    <span className="text-[10.5px] font-medium uppercase tracking-wider text-graphite-500">
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
                          onClick={() => setOpen(false)}
                          className={cn(
                            "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] font-medium transition-all",
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
                                : "text-graphite-500"
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

          {/* Bottom nav */}
          <div className="border-t border-graphite-100 p-3">
            <ul className="space-y-0.5">
              {bottomNav.map((item) => {
                const isActive = pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] font-medium transition-all",
                        isActive
                          ? "bg-white text-graphite-900 shadow-soft-xs border border-graphite-200/60"
                          : "text-graphite-600 hover:text-graphite-900 hover:bg-white/60"
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4",
                          isActive ? "text-graphite-900" : "text-graphite-500"
                        )}
                        strokeWidth={2}
                      />
                      <span className="flex-1">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
