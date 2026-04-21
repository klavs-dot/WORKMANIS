/**
 * Employees — CRUD on 20_employees tab.
 *
 * For V1, compliance (OVP, safety briefing) lives as flattened
 * fields in the employee row. Bank accounts and contracts are
 * NOT migrated in this endpoint — they'll get their own
 * /api/bank-accounts and /api/contracts endpoints in a later
 * session with their corresponding UI support.
 *
 * For now, addEmployee/updateEmployee calls that include
 * bankAccounts or contracts in the patch get those fields
 * silently dropped. The client-side store still holds them in
 * state (from old localStorage data) but they aren't persisted
 * to Sheets. This is intentional: we want a clean cut where
 * the main employee record syncs to Sheets, and the related
 * records migrate as a follow-up.
 */

import { makeListCreateHandlers } from "@/lib/store-routes";

export const maxDuration = 30;

interface EmployeeRow extends Record<string, string> {
  first_name: string;
  last_name: string;
  personal_code: string;
  email: string;
  phone: string;
  status: string;
  position: string;
  started_at: string;
  notes: string;
  ovp_passed: string;
  ovp_last_check_date: string;
  ovp_next_due_date: string;
  ovp_notes: string;
  safety_passed: string;
  safety_last_briefing_date: string;
  safety_next_due_date: string;
  safety_briefing_type: string;
  safety_notes: string;
  photo_drive_id: string;
  folder_drive_id: string;
}

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

function parseCreateBody(body: unknown): EmployeeRow | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.first_name !== "string" || !b.first_name.trim()) return null;
  if (typeof b.last_name !== "string" || !b.last_name.trim()) return null;

  const ovp = (b.ovp as Record<string, unknown>) ?? {};
  const safety = (b.safety_briefing as Record<string, unknown>) ?? {};

  return {
    first_name: (b.first_name as string).trim(),
    last_name: (b.last_name as string).trim(),
    personal_code:
      typeof b.personal_code === "string" ? b.personal_code : "",
    email: typeof b.email === "string" ? b.email : "",
    phone: typeof b.phone === "string" ? b.phone : "",
    status: typeof b.status === "string" ? b.status : "aktivs",
    position: typeof b.position === "string" ? b.position : "",
    started_at: typeof b.started_at === "string" ? b.started_at : "",
    notes: typeof b.notes === "string" ? b.notes : "",
    ovp_passed: ovp.passed === true ? "TRUE" : "FALSE",
    ovp_last_check_date:
      typeof ovp.lastCheckDate === "string" ? ovp.lastCheckDate : "",
    ovp_next_due_date:
      typeof ovp.nextDueDate === "string" ? ovp.nextDueDate : "",
    ovp_notes: typeof ovp.notes === "string" ? ovp.notes : "",
    safety_passed: safety.passed === true ? "TRUE" : "FALSE",
    safety_last_briefing_date:
      typeof safety.lastBriefingDate === "string"
        ? safety.lastBriefingDate
        : "",
    safety_next_due_date:
      typeof safety.nextDueDate === "string" ? safety.nextDueDate : "",
    safety_briefing_type:
      typeof safety.briefingType === "string" ? safety.briefingType : "",
    safety_notes: typeof safety.notes === "string" ? safety.notes : "",
    photo_drive_id: "",
    folder_drive_id: "",
  };
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

export const { GET, POST } = makeListCreateHandlers<
  EmployeeRow,
  ApiEmployee
>({
  tab: "20_employees",
  responseKey: "employees",
  singularKey: "employee",
  parseCreateBody,
  rowToApi,
});
