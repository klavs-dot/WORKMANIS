/**
 * Employees — PATCH and DELETE on 20_employees/{id}
 *
 * The PATCH body accepts the same shape as POST creation, but
 * every field is optional. Compliance sub-objects (ovp,
 * safety_briefing) are flattened into individual columns; if
 * the client sends the whole object we flatten it here.
 *
 * Related records (contracts, bankAccounts) in the patch body
 * are intentionally ignored — those will get their own endpoints.
 */

import { makeUpdateDeleteHandlers } from "@/lib/store-routes";

export const maxDuration = 30;

interface ApiEmployee {
  id: string;
  firstName: string;
  lastName: string;
  personalCode: string | undefined;
  email: string | undefined;
  phone: string | undefined;
  status: string;
  position: string | undefined;
  startedAt: string | undefined;
  notes: string | undefined;
  ovp: {
    passed: boolean;
    lastCheckDate: string | undefined;
    nextDueDate: string | undefined;
    notes: string | undefined;
  };
  safetyBriefing: {
    passed: boolean;
    lastBriefingDate: string | undefined;
    nextDueDate: string | undefined;
    briefingType: string | undefined;
    notes: string | undefined;
  };
  createdAt: string;
  updatedAt: string;
}

function parseUpdateBody(
  body: unknown
): (Record<string, string> & { expected_updated_at: string }) | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.expected_updated_at !== "string" || !b.expected_updated_at) {
    return null;
  }

  const patch: Record<string, string> & { expected_updated_at: string } = {
    expected_updated_at: b.expected_updated_at,
  };

  // Scalar fields
  const stringFields = [
    "first_name",
    "last_name",
    "personal_code",
    "email",
    "phone",
    "status",
    "position",
    "started_at",
    "notes",
  ] as const;
  for (const key of stringFields) {
    const v = b[key];
    if (typeof v === "string") patch[key] = v;
  }

  // Flatten OVP if provided as nested object
  if (b.ovp && typeof b.ovp === "object") {
    const ovp = b.ovp as Record<string, unknown>;
    if (typeof ovp.passed === "boolean") {
      patch.ovp_passed = ovp.passed ? "TRUE" : "FALSE";
    }
    if (typeof ovp.lastCheckDate === "string") {
      patch.ovp_last_check_date = ovp.lastCheckDate;
    }
    if (typeof ovp.nextDueDate === "string") {
      patch.ovp_next_due_date = ovp.nextDueDate;
    }
    if (typeof ovp.notes === "string") {
      patch.ovp_notes = ovp.notes;
    }
  }

  // Flatten safety briefing if provided
  if (b.safety_briefing && typeof b.safety_briefing === "object") {
    const safety = b.safety_briefing as Record<string, unknown>;
    if (typeof safety.passed === "boolean") {
      patch.safety_passed = safety.passed ? "TRUE" : "FALSE";
    }
    if (typeof safety.lastBriefingDate === "string") {
      patch.safety_last_briefing_date = safety.lastBriefingDate;
    }
    if (typeof safety.nextDueDate === "string") {
      patch.safety_next_due_date = safety.nextDueDate;
    }
    if (typeof safety.briefingType === "string") {
      patch.safety_briefing_type = safety.briefingType;
    }
    if (typeof safety.notes === "string") {
      patch.safety_notes = safety.notes;
    }
  }

  return patch;
}

function rowToApi(row: Record<string, unknown>): ApiEmployee {
  return {
    id: row.id as string,
    firstName: (row.first_name as string) ?? "",
    lastName: (row.last_name as string) ?? "",
    personalCode:
      ((row.personal_code as string) || undefined) as string | undefined,
    email: ((row.email as string) || undefined) as string | undefined,
    phone: ((row.phone as string) || undefined) as string | undefined,
    status: (row.status as string) || "aktivs",
    position: ((row.position as string) || undefined) as string | undefined,
    startedAt:
      ((row.started_at as string) || undefined) as string | undefined,
    notes: ((row.notes as string) || undefined) as string | undefined,
    ovp: {
      passed: (row.ovp_passed as string) === "TRUE",
      lastCheckDate:
        ((row.ovp_last_check_date as string) || undefined) as
          | string
          | undefined,
      nextDueDate:
        ((row.ovp_next_due_date as string) || undefined) as
          | string
          | undefined,
      notes: ((row.ovp_notes as string) || undefined) as string | undefined,
    },
    safetyBriefing: {
      passed: (row.safety_passed as string) === "TRUE",
      lastBriefingDate:
        ((row.safety_last_briefing_date as string) || undefined) as
          | string
          | undefined,
      nextDueDate:
        ((row.safety_next_due_date as string) || undefined) as
          | string
          | undefined,
      briefingType:
        ((row.safety_briefing_type as string) || undefined) as
          | string
          | undefined,
      notes:
        ((row.safety_notes as string) || undefined) as string | undefined,
    },
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

export const { PATCH, DELETE } = makeUpdateDeleteHandlers<ApiEmployee>({
  tab: "20_employees",
  singularKey: "employee",
  entityName: "Employee",
  parseUpdateBody,
  rowToApi,
});
