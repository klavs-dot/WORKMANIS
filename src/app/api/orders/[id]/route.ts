/**
 * Orders — PATCH and DELETE on 25_orders/{id}
 */

import { makeUpdateDeleteHandlers } from "@/lib/store-routes";

export const maxDuration = 30;

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

  const stringFields = [
    "type",
    "title",
    "issue_date",
    "employee_id",
    "employee_name",
    "destination_from",
    "destination_to",
    "trip_start_date",
    "trip_end_date",
    "vacation_start_date",
    "vacation_end_date",
    "vacation_pay_timing",
    "notes",
    "file_name",
  ] as const;

  for (const key of stringFields) {
    const v = b[key];
    if (typeof v === "string") patch[key] = v;
  }

  return patch;
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

export const { PATCH, DELETE } = makeUpdateDeleteHandlers<ApiOrder>({
  tab: "25_orders",
  singularKey: "order",
  entityName: "Order",
  parseUpdateBody,
  rowToApi,
});
