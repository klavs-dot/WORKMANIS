"use client";

import { useMemo } from "react";
import { useBilling } from "./billing-store";
import { useAssets } from "./assets-store";
import { useEmployees, isOVPOverdue, isSafetyOverdue } from "./employees-store";

/**
 * Centralized notification counts for sidebar badges.
 *
 * Each key maps to a sidebar href. Value = number of items
 * needing attention. 0 or undefined = no red dot.
 *
 * Keep this pure + derived; don't persist anything.
 */
export interface NotificationCounts {
  rekini: number; // total across sub-sections except 'ienakosie'
  rekiniBreakdown: {
    izejosie: number; // unpaid outgoing bills (to suppliers)
    automatiskie: number; // unpaid online/subscription payments
    veikala: number; // unpaid store card transactions
    algas: number; // prepared unpaid salaries
    nodokli: number; // prepared unpaid taxes
  };
  darbinieki: number; // employees with overdue OVP or DDI
  aktivi: number; // assets with reminderDate reached
}

export function useNotifications(): NotificationCounts {
  const { outgoing, salaries, taxes } = useBilling();
  const { assets } = useAssets();
  const { employees } = useEmployees();

  return useMemo(() => {
    // Izejošie: rēķini, ko mums jāmaksā piegādātājiem — unpaid only
    const izejosie = outgoing.filter((p) => p.status !== "apmaksats").length;

    // Automātiskie & Internetā — these are mock read-only demo data
    // right now, so no meaningful unpaid state. Keeping the slot
    // so it wires up cleanly once the store gets real entries.
    const automatiskie = 0;

    // Fiziskie maksājumi — same; mock data with no status field
    const veikala = 0;

    // Algas: prepared, not yet paid out
    const algas = salaries.filter((s) => s.status === "sagatavots").length;

    // Nodokļi: prepared, not yet paid
    const nodokli = taxes.filter((t) => t.status === "sagatavots").length;

    const rekiniTotal = izejosie + automatiskie + veikala + algas + nodokli;

    // Darbinieki: anyone with OVP or DDI overdue
    const darbiniekiCount = employees.filter(
      (e) => isOVPOverdue(e.ovp) || isSafetyOverdue(e.safetyBriefing)
    ).length;

    // Aktīvi: anything with a reminderDate that has arrived
    const today = new Date().toISOString().slice(0, 10);
    const aktiviCount = assets.filter(
      (a) => a.reminderDate && a.reminderDate <= today
    ).length;

    return {
      rekini: rekiniTotal,
      rekiniBreakdown: {
        izejosie,
        automatiskie,
        veikala,
        algas,
        nodokli,
      },
      darbinieki: darbiniekiCount,
      aktivi: aktiviCount,
    };
  }, [outgoing, salaries, taxes, assets, employees]);
}
