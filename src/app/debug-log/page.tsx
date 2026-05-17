"use client";

/**
 * /debug-log — diagnostic log viewer.
 *
 * Shows the recent API calls, JS errors, and custom log entries
 * the app has emitted, chronologically. Live-updates when new
 * entries land via the 'workmanis:log' custom event.
 *
 * For users without Vercel server-log access (i.e. everyone
 * except the system administrator), this is the primary tool
 * for diagnosing UX bugs:
 *   - "Page loaded but data didn't appear" → check API call
 *     statuses + durations
 *   - "Something silently failed" → check error entries
 *   - "Performance feels slow" → check call durations
 *
 * Copy-to-clipboard button packages the log as JSON for sharing.
 */

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/business/headers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getLog,
  clearLog,
  type LogEntry,
  type LogLevel,
} from "@/lib/client-logger";
import { useConfirm } from "@/lib/confirm-context";
import { Trash2, Copy, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const LEVEL_LABEL: Record<LogLevel, string> = {
  info: "Info",
  warn: "Brīdinājums",
  error: "Kļūda",
  api: "API",
};

const LEVEL_COLOR: Record<LogLevel, string> = {
  info: "bg-graphite-100 text-graphite-700 border-graphite-200",
  warn: "bg-amber-50 text-amber-900 border-amber-200",
  error: "bg-red-50 text-red-900 border-red-200",
  api: "bg-blue-50 text-blue-900 border-blue-200",
};

export default function DebugLogPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<"all" | LogLevel>("all");
  const confirm = useConfirm();

  const refresh = () => setEntries(getLog());

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener("workmanis:log", onChange);
    return () => window.removeEventListener("workmanis:log", onChange);
  }, []);

  const filtered =
    filter === "all" ? entries : entries.filter((e) => e.level === filter);

  // Newest first for the table
  const displayed = [...filtered].reverse();

  const counts = entries.reduce(
    (acc, e) => {
      acc[e.level] = (acc[e.level] ?? 0) + 1;
      return acc;
    },
    {} as Record<LogLevel, number>
  );

  const copyAll = () => {
    const text = JSON.stringify(displayed, null, 2);
    void navigator.clipboard.writeText(text);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Diagnostikas žurnāls"
          description="API zvani, JS kļūdas un sistēmas notikumi. Saglabājas pārlūkā (localStorage)."
          actions={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={refresh}>
                <RefreshCw className="h-3.5 w-3.5" />
                Atjaunot
              </Button>
              <Button size="sm" variant="outline" onClick={copyAll}>
                <Copy className="h-3.5 w-3.5" />
                Kopēt
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const ok = await confirm({
                    title: "Dzēst visus log ierakstus?",
                    description:
                      "Visi diagnostikas ieraksti tiks neatgriezeniski izdzēsti no šī pārlūka.",
                    destructive: true,
                    confirmLabel: "Dzēst",
                  });
                  if (ok) clearLog();
                }}
              >
                <Trash2 className="h-3.5 w-3.5 text-red-600" />
                Dzēst
              </Button>
            </div>
          }
        />

        {/* Filter + counts */}
        <div className="flex items-center gap-3 flex-wrap">
          <Select
            value={filter}
            onValueChange={(v) => setFilter(v as typeof filter)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                Visi ({entries.length})
              </SelectItem>
              <SelectItem value="error">
                Tikai kļūdas ({counts.error ?? 0})
              </SelectItem>
              <SelectItem value="warn">
                Brīdinājumi ({counts.warn ?? 0})
              </SelectItem>
              <SelectItem value="api">
                API zvani ({counts.api ?? 0})
              </SelectItem>
              <SelectItem value="info">
                Info ({counts.info ?? 0})
              </SelectItem>
            </SelectContent>
          </Select>

          <span className="text-xs text-graphite-500">
            {displayed.length === 0
              ? "Nav ierakstu — veic kādu darbību lapā"
              : `Rāda ${displayed.length} ${
                  displayed.length === 1 ? "ierakstu" : "ierakstus"
                }, jaunākais augšā`}
          </span>
        </div>

        {/* Entries */}
        {displayed.length === 0 ? (
          <Card className="p-12 text-center text-sm text-graphite-500">
            Žurnāls tukšs. Naviģējies pa lapu, dari kādu darbību —
            ieraksti parādīsies šeit reālā laikā.
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="divide-y divide-graphite-200">
              {displayed.map((e, i) => (
                <LogRow key={`${e.time}-${i}`} entry={e} />
              ))}
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = entry.details !== undefined;

  const time = new Date(entry.time);
  const hh = String(time.getHours()).padStart(2, "0");
  const mm = String(time.getMinutes()).padStart(2, "0");
  const ss = String(time.getSeconds()).padStart(2, "0");
  const ms = String(time.getMilliseconds()).padStart(3, "0");

  return (
    <div
      className={cn(
        "px-4 py-2.5 hover:bg-graphite-50/50",
        hasDetails && "cursor-pointer"
      )}
      onClick={() => hasDetails && setExpanded((v) => !v)}
    >
      <div className="flex items-start gap-3">
        <span className="font-mono text-[11px] text-graphite-500 mt-0.5 shrink-0">
          {hh}:{mm}:{ss}.{ms}
        </span>
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 text-[10px] uppercase tracking-wide border",
            LEVEL_COLOR[entry.level]
          )}
        >
          {LEVEL_LABEL[entry.level]}
        </Badge>
        <span className="text-sm text-graphite-800 flex-1 break-words">
          {entry.message}
        </span>
      </div>
      {hasDetails && expanded && (
        <pre className="mt-2 ml-[68px] text-[11px] font-mono bg-graphite-100 rounded p-2 overflow-x-auto">
          {JSON.stringify(entry.details, null, 2)}
        </pre>
      )}
    </div>
  );
}
