"use client";

/**
 * GmailStatusChip — small inline indicator on each company row
 * showing whether Gmail/Drive/Sheets OAuth is connected.
 *
 * Three visual states:
 *
 *   1. Connected (full scopes): green dot + "Pievienots: x@y.com"
 *   2. Connected (partial — Gmail not granted): amber dot +
 *      "Atjaunot Gmail" button that re-runs OAuth flow
 *   3. Not connected: gray dot + "Pievienot Gmail" button
 *
 * On loading: spinner. On error: red dot + retry.
 *
 * The chip itself is interactive — clicking the button kicks off
 * /api/companies/oauth/reconnect, which returns a Google consent
 * URL that we redirect the page to. After consent, Google
 * redirects back to /uznemumi?reconnected=ID and the parent page's
 * useEffect picks that up to refresh state + show a toast.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Mail, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { pushToastGlobally } from "@/lib/toast-context";
import { cn } from "@/lib/utils";

interface GmailStatusChipProps {
  companyId: string;
  /**
   * Bumped by the parent when it knows the status might have
   * changed (e.g. after the OAuth callback redirect lands).
   * The chip refetches its status when this changes.
   */
  refreshKey?: number;
}

interface OAuthStatus {
  connected: boolean;
  gmailAddress?: string;
  hasGmail?: boolean;
  hasDrive?: boolean;
  hasSheets?: boolean;
}

export function GmailStatusChip({
  companyId,
  refreshKey = 0,
}: GmailStatusChipProps) {
  const [status, setStatus] = useState<OAuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(
      `/api/companies/oauth/status?company_id=${encodeURIComponent(companyId)}`
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: OAuthStatus) => {
        if (cancelled) return;
        setStatus(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn(`[gmail-chip] status fetch failed:`, err);
        setError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, refreshKey]);

  const handleReconnect = async () => {
    if (reconnecting) return;
    setReconnecting(true);
    try {
      const res = await fetch("/api/companies/oauth/reconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId }),
      });
      if (!res.ok) {
        const errBody = await res
          .json()
          .catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errBody?.error || `Kļūda ${res.status}`);
      }
      const data = (await res.json()) as { oauthUrl: string };
      // Full-page redirect to Google's consent screen. On return,
      // the /uznemumi page reads ?reconnected=ID and refreshes.
      window.location.href = data.oauthUrl;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Reconnect neizdevās";
      pushToastGlobally("error", msg, 6000);
      setReconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-graphite-50 border border-graphite-200">
        <Loader2 className="h-3 w-3 text-graphite-400 animate-spin" />
        <span className="text-[10.5px] text-graphite-500">Pārbauda…</span>
      </div>
    );
  }

  if (error) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(false);
          setLoading(true);
          // Trigger refetch by bumping a local counter — we
          // re-run the effect by toggling loading.
          // Simpler: just call the same handler.
          fetch(
            `/api/companies/oauth/status?company_id=${encodeURIComponent(companyId)}`
          )
            .then((r) => r.json())
            .then((data) => {
              setStatus(data);
              setLoading(false);
            })
            .catch(() => {
              setError(true);
              setLoading(false);
            });
        }}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-50 border border-red-200 text-red-700 hover:bg-red-100"
        title="Statusa pārbaude neizdevās — spied lai mēģinātu vēlreiz"
      >
        <AlertTriangle className="h-3 w-3" />
        <span className="text-[10.5px] font-medium">Kļūda</span>
      </button>
    );
  }

  if (!status?.connected) {
    return (
      <button
        type="button"
        onClick={handleReconnect}
        disabled={reconnecting}
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors",
          "bg-graphite-50 border border-graphite-300 text-graphite-700",
          "hover:bg-graphite-100 hover:border-graphite-400",
          reconnecting && "cursor-wait opacity-70"
        )}
        title="Pievienot Gmail kontu šim uzņēmumam"
      >
        {reconnecting ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Mail className="h-3 w-3" />
        )}
        <span className="text-[10.5px] font-medium">
          {reconnecting ? "Pārvirzām…" : "Pievienot Gmail"}
        </span>
      </button>
    );
  }

  // Connected — check whether Gmail scope is actually granted.
  // Drive + Sheets are always present (login scopes), so the only
  // partial state we worry about is Gmail-missing.
  const partial = status.connected && !status.hasGmail;
  const tooltipParts = [
    `Gmail: ${status.gmailAddress ?? "?"}`,
    `Drive: ${status.hasDrive ? "✓" : "✗"}`,
    `Sheets: ${status.hasSheets ? "✓" : "✗"}`,
    `Gmail lasīšana: ${status.hasGmail ? "✓" : "✗"}`,
  ];
  const tooltip = tooltipParts.join("\n");

  if (partial) {
    return (
      <button
        type="button"
        onClick={handleReconnect}
        disabled={reconnecting}
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors",
          "bg-amber-50 border border-amber-300 text-amber-800",
          "hover:bg-amber-100 hover:border-amber-400",
          reconnecting && "cursor-wait opacity-70"
        )}
        title={`${tooltip}\n\nGmail lasīšanas atļauja trūkst. Spied, lai atjaunotu.`}
      >
        {reconnecting ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <RefreshCw className="h-3 w-3" />
        )}
        <span className="text-[10.5px] font-medium truncate max-w-[180px]">
          {reconnecting
            ? "Pārvirzām…"
            : `Atjaunot Gmail · ${status.gmailAddress ?? ""}`}
        </span>
      </button>
    );
  }

  // Fully connected — green chip showing the address
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800"
      title={tooltip}
    >
      <Mail className="h-3 w-3" />
      <span className="text-[10.5px] font-medium truncate max-w-[180px]">
        {status.gmailAddress ?? "Pievienots"}
      </span>
    </motion.div>
  );
}
