// Generates invoice/delivery note numbers in format "DDMMGG-N"
// Where N is incremented per day (persisted via localStorage)

const COUNTERS_KEY = "workmanis:number-counters";

type CounterType = "invoice" | "delivery";

interface Counters {
  [key: string]: number; // key: "invoice:DDMMGG" -> last N
}

function readCounters(): Counters {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(COUNTERS_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeCounters(c: Counters) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COUNTERS_KEY, JSON.stringify(c));
  } catch {
    // ignore
  }
}

function formatDatePart(d: Date = new Date()): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const gg = String(d.getFullYear() % 100).padStart(2, "0");
  return `${dd}${mm}${gg}`;
}

/** Generates next sequential number for today, e.g. "190426-1", "190426-2" */
export function generateNumber(type: CounterType, date?: Date): string {
  const datePart = formatDatePart(date);
  const key = `${type}:${datePart}`;
  const counters = readCounters();
  const next = (counters[key] || 0) + 1;
  counters[key] = next;
  writeCounters(counters);
  return `${datePart}-${next}`;
}

/** Preview next number without incrementing counter */
export function previewNumber(type: CounterType, date?: Date): string {
  const datePart = formatDatePart(date);
  const key = `${type}:${datePart}`;
  const counters = readCounters();
  const next = (counters[key] || 0) + 1;
  return `${datePart}-${next}`;
}

export function invoiceNumberLabel(raw: string): string {
  return `Rēķins Nr. ${raw}`;
}

export function deliveryNumberLabel(raw: string): string {
  return `Pavadzīme Nr. ${raw}`;
}
