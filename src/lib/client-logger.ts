"use client";

/**
 * Client-side logging for debugging UX bugs without Vercel access.
 *
 * Records timestamped entries to localStorage. The /debug-log page
 * reads them and renders a chronological list. Each entry has:
 *   - level: 'info' | 'warn' | 'error' | 'api'
 *   - time: ISO timestamp
 *   - message: short label
 *   - details: arbitrary JSON-able payload (optional)
 *
 * Why localStorage and not a remote endpoint:
 *   - Works without sending data anywhere — privacy-preserving
 *   - No backend dependency means even when the API is broken
 *     we still capture what happened
 *   - User can copy + paste to a chat to get help
 *
 * Capacity: keep last 200 entries. Older entries silently drop
 * to avoid filling localStorage (5MB cap).
 *
 * Auto-instrumentation:
 *   - installFetchLogger() wraps window.fetch to log every API
 *     call (URL + method + status + duration)
 *   - installErrorLogger() catches uncaught JS errors and
 *     unhandled promise rejections
 *   Both are no-ops on the server and idempotent (calling
 *   twice is fine).
 */

export type LogLevel = "info" | "warn" | "error" | "api";

export interface LogEntry {
  time: string;
  level: LogLevel;
  message: string;
  details?: unknown;
}

const STORAGE_KEY = "workmanis:debug-log";
const MAX_ENTRIES = 200;

function read(): LogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(entries: LogEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    // Trim oldest entries if over cap
    const trimmed = entries.slice(-MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    // Dispatch a custom event so the /debug-log page can refresh
    // in real time without polling
    window.dispatchEvent(new CustomEvent("workmanis:log"));
  } catch {
    // localStorage full — silently drop
  }
}

export function log(
  level: LogLevel,
  message: string,
  details?: unknown
): void {
  if (typeof window === "undefined") return;
  const entries = read();
  entries.push({
    time: new Date().toISOString(),
    level,
    message,
    details,
  });
  write(entries);
}

export function clearLog(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("workmanis:log"));
}

export function getLog(): LogEntry[] {
  return read();
}

// ============================================================
// Auto-instrumentation — install once on app mount
// ============================================================

let fetchInstalled = false;

export function installFetchLogger(): void {
  if (typeof window === "undefined") return;
  if (fetchInstalled) return;
  fetchInstalled = true;

  const original = window.fetch.bind(window);
  window.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const method = init?.method ?? "GET";
    const t0 = performance.now();

    // Only log /api/* — third-party calls and Next.js internals
    // would create a lot of noise.
    const isApi = url.startsWith("/api/") || url.includes("workmanis.vercel.app/api/");

    try {
      const response = await original(input, init);
      const dt = Math.round(performance.now() - t0);
      if (isApi) {
        log(
          response.ok ? "api" : "error",
          `${method} ${shortenUrl(url)} → ${response.status} (${dt}ms)`,
          response.ok
            ? undefined
            : { status: response.status, url }
        );
      }
      return response;
    } catch (err) {
      const dt = Math.round(performance.now() - t0);
      if (isApi) {
        log("error", `${method} ${shortenUrl(url)} CRASHED (${dt}ms)`, {
          error: err instanceof Error ? err.message : String(err),
          url,
        });
      }
      throw err;
    }
  };
}

let errorInstalled = false;

export function installErrorLogger(): void {
  if (typeof window === "undefined") return;
  if (errorInstalled) return;
  errorInstalled = true;

  window.addEventListener("error", (e) => {
    log("error", `JS error: ${e.message}`, {
      filename: e.filename,
      line: e.lineno,
      col: e.colno,
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    log("error", `Unhandled rejection: ${reason}`, {
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}

function shortenUrl(url: string): string {
  // Strip origin and query string for readability
  try {
    const u = new URL(url, "http://x");
    return u.pathname + (u.search ? "?…" : "");
  } catch {
    return url.slice(0, 80);
  }
}
