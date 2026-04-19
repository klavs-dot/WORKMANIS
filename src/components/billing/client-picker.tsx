"use client";

import { useRef, useState, useEffect } from "react";
import { Search, Plus, Check, Building2, User, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useClients } from "@/lib/clients-store";
import type { Client } from "@/lib/billing-types";
import { cn } from "@/lib/utils";

interface ClientPickerProps {
  value: Client | null;
  onChange: (client: Client | null) => void;
  onCreateNew: (nameHint?: string) => void;
}

export function ClientPicker({
  value,
  onChange,
  onCreateNew,
}: ClientPickerProps) {
  const { clients, searchClients } = useClients();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const results = query.trim() ? searchClients(query) : clients.slice(0, 8);

  const selectClient = (c: Client) => {
    onChange(c);
    setQuery("");
    setOpen(false);
  };

  const clearSelection = () => {
    onChange(null);
    setQuery("");
  };

  if (value) {
    return (
      <div className="rounded-xl border border-graphite-200 bg-white p-3.5 flex items-start gap-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white shadow-soft-xs",
            value.type === "juridiska" ? "bg-graphite-900" : "bg-sky-600"
          )}
        >
          {value.type === "juridiska" ? (
            <Building2 className="h-4 w-4" />
          ) : (
            <User className="h-4 w-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[14px] font-semibold text-graphite-900 truncate">
              {value.name}
            </p>
            <span className="inline-flex items-center gap-1 rounded-md bg-graphite-100 px-1.5 py-0.5 text-[10px] font-mono text-graphite-600">
              {value.countryCode}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11.5px] text-graphite-500 mt-0.5">
            {value.vatNumber && (
              <span className="font-mono">{value.vatNumber}</span>
            )}
            {value.legalAddress && (
              <span className="flex items-center gap-1">
                <MapPin className="h-2.5 w-2.5" />
                <span className="truncate max-w-[260px]">
                  {value.legalAddress}
                </span>
              </span>
            )}
          </div>
          {value.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {value.keywords.map((k) => (
                <Badge key={k} variant="muted" className="text-[10px]">
                  {k}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={clearSelection}>
          Mainīt
        </Button>
      </div>
    );
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-graphite-400" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Meklēt pēc nosaukuma, atslēgvārda vai reģ. nr."
          className="w-full h-10 rounded-lg border border-graphite-200 bg-white pl-9 pr-3 text-[13.5px] text-graphite-800 placeholder:text-graphite-400 hover:border-graphite-300 focus:border-graphite-900 focus:outline-none focus:ring-2 focus:ring-graphite-900/5 transition-colors"
        />
      </div>

      {open && (
        <Card className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 shadow-soft-lg max-h-[360px] overflow-y-auto">
          {results.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-[12.5px] text-graphite-500">
                Nav atrasts neviens klients ar{" "}
                <span className="font-medium text-graphite-700">"{query}"</span>
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="mt-3"
                onClick={() => {
                  onCreateNew(query);
                  setOpen(false);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Izveidot "{query.trim()}"
              </Button>
            </div>
          ) : (
            <>
              <div className="p-1">
                {results.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => selectClient(c)}
                    className="w-full flex items-start gap-3 p-2.5 rounded-md hover:bg-graphite-50 transition-colors text-left"
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white text-[10px] font-semibold mt-0.5",
                        c.type === "juridiska" ? "bg-graphite-900" : "bg-sky-600"
                      )}
                    >
                      {c.type === "juridiska" ? (
                        <Building2 className="h-3.5 w-3.5" />
                      ) : (
                        <User className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-medium text-graphite-900 truncate">
                          {c.name}
                        </p>
                        <span className="text-[10px] font-mono text-graphite-400">
                          {c.countryCode}
                        </span>
                      </div>
                      {c.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {c.keywords.slice(0, 4).map((k) => (
                            <span
                              key={k}
                              className="text-[10.5px] text-graphite-500"
                            >
                              #{k}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              <div className="border-t border-graphite-100 p-2">
                <button
                  onClick={() => {
                    onCreateNew(query);
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-[12.5px] font-medium text-graphite-700 hover:bg-graphite-50 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5 text-graphite-500" />
                  Pievienot jaunu klientu
                </button>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
