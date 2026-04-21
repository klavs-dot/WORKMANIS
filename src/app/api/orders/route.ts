/**
 * Orders — CRUD on 25_orders tab.
 *
 * Represents HR orders (rīkojumi): komandējumi, atvaļinājumi,
 * darba piesakšanas, atlaišanas. Each order may reference an
 * employee via employee_id (soft FK into 20_employees) with
 * employee_name denormalized for quick reads.
 */

import { makeListCreateHandlers } from "@/lib/store-routes";

export const maxDuration = 30;

interface OrderRow extends Record<string, string> {
  type: string;
  title: string;
  issue_date: string;
  employee_id: string;
  employee_name: string;
  destination_from: string;
  destination_to: string;
  trip_start_date: string;
  trip_end_date: string;
  vacation_start_date: string;
  vacation_end_date: string;
  vacation_pay_timing: string;
  notes: string;
  file_name: string;
}

interface ApiOrder {
  id: string;
  type: string;
  title: string;
  issueDate: string;
  employeeId: string | undefined;
  employeeName: string | undefined;
  destinationFrom: string | undefined;
  destinationTo: string | undefined;
  tripStartDate: string | undefined;
  tripEndDate: string | undefined;
  vacationStartDate: string | undefined;
  vacationEndDate: string | undefined;
  vacationPayTiming: string | undefined;
  notes: string | undefined;
  fileName: string | undefined;
  createdAt: string;
  updatedAt: string;
}

function parseCreateBody(body: unknown): OrderRow | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.type !== "string" || !b.type) return null;
  if (typeof b.title !== "string" || !b.title.trim()) return null;
  if (typeof b.issue_date !== "string" || !b.issue_date) return null;

  return {
    type: b.type,
    title: (b.title as string).trim(),
    issue_date: b.issue_date,
    employee_id: typeof b.employee_id === "string" ? b.employee_id : "",
    employee_name:
      typeof b.employee_name === "string" ? b.employee_name : "",
    destination_from:
      typeof b.destination_from === "string" ? b.destination_from : "",
    destination_to:
      typeof b.destination_to === "string" ? b.destination_to : "",
    trip_start_date:
      typeof b.trip_start_date === "string" ? b.trip_start_date : "",
    trip_end_date:
      typeof b.trip_end_date === "string" ? b.trip_end_date : "",
    vacation_start_date:
      typeof b.vacation_start_date === "string"
        ? b.vacation_start_date
        : "",
    vacation_end_date:
      typeof b.vacation_end_date === "string" ? b.vacation_end_date : "",
    vacation_pay_timing:
      typeof b.vacation_pay_timing === "string"
        ? b.vacation_pay_timing
        : "",
    notes: typeof b.notes === "string" ? b.notes : "",
    file_name: typeof b.file_name === "string" ? b.file_name : "",
  };
}

function rowToApi(row: Record<string, unknown>): ApiOrder {
  return {
    id: row.id as string,
    type: (row.type as string) ?? "cits",
    title: (row.title as string) ?? "",
    issueDate: (row.issue_date as string) ?? "",
    employeeId: ((row.employee_id as string) || undefined) as
      | string
      | undefined,
    employeeName: ((row.employee_name as string) || undefined) as
      | string
      | undefined,
    destinationFrom: ((row.destination_from as string) || undefined) as
      | string
      | undefined,
    destinationTo: ((row.destination_to as string) || undefined) as
      | string
      | undefined,
    tripStartDate: ((row.trip_start_date as string) || undefined) as
      | string
      | undefined,
    tripEndDate: ((row.trip_end_date as string) || undefined) as
      | string
      | undefined,
    vacationStartDate: ((row.vacation_start_date as string) || undefined) as
      | string
      | undefined,
    vacationEndDate: ((row.vacation_end_date as string) || undefined) as
      | string
      | undefined,
    vacationPayTiming: ((row.vacation_pay_timing as string) || undefined) as
      | string
      | undefined,
    notes: ((row.notes as string) || undefined) as string | undefined,
    fileName: ((row.file_name as string) || undefined) as
      | string
      | undefined,
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

export const { GET, POST } = makeListCreateHandlers<OrderRow, ApiOrder>({
  tab: "25_orders",
  responseKey: "orders",
  singularKey: "order",
  parseCreateBody,
  rowToApi,
});
