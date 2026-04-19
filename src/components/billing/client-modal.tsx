"use client";

import { useEffect, useState } from "react";
import { Save, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/primitives";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useClients } from "@/lib/clients-store";
import { COUNTRIES } from "@/lib/countries";
import type { Client, ClientType } from "@/lib/billing-types";

interface ClientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (client: Client) => void;
  editing?: Client | null;
  initialName?: string;
}

export function ClientModal({
  open,
  onOpenChange,
  onCreated,
  editing,
  initialName,
}: ClientModalProps) {
  const { addClient, updateClient } = useClients();

  const [type, setType] = useState<ClientType>("juridiska");
  const [name, setName] = useState("");
  const [regNumber, setRegNumber] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [legalAddress, setLegalAddress] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [countryCode, setCountryCode] = useState("LV");
  const [keywordInput, setKeywordInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setType(editing.type);
      setName(editing.name);
      setRegNumber(editing.regNumber ?? "");
      setVatNumber(editing.vatNumber ?? "");
      setLegalAddress(editing.legalAddress ?? "");
      setBankAccount(editing.bankAccount ?? "");
      setCountryCode(editing.countryCode);
      setKeywords(editing.keywords);
      setKeywordInput("");
    } else {
      setType("juridiska");
      setName(initialName ?? "");
      setRegNumber("");
      setVatNumber("");
      setLegalAddress("");
      setBankAccount("");
      setCountryCode("LV");
      setKeywords([]);
      setKeywordInput("");
    }
  }, [open, editing, initialName]);

  const commitKeyword = (raw?: string) => {
    const source = raw ?? keywordInput;
    const next = source
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0 && !keywords.includes(k));
    if (next.length > 0) {
      setKeywords([...keywords, ...next]);
    }
    setKeywordInput("");
  };

  const removeKeyword = (k: string) => {
    setKeywords(keywords.filter((x) => x !== k));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitKeyword();
    } else if (e.key === "Backspace" && keywordInput === "" && keywords.length > 0) {
      setKeywords(keywords.slice(0, -1));
    }
  };

  const submit = () => {
    if (!name.trim()) return;
    const country = COUNTRIES.find((c) => c.code === countryCode)?.name ?? "Latvija";

    const payload = {
      type,
      name: name.trim(),
      regNumber: regNumber.trim() || undefined,
      vatNumber: vatNumber.trim() || undefined,
      legalAddress: legalAddress.trim() || undefined,
      bankAccount: bankAccount.trim() || undefined,
      country,
      countryCode,
      keywords,
    };

    if (editing) {
      updateClient(editing.id, payload);
      onCreated?.({ ...editing, ...payload });
    } else {
      const newClient = addClient(payload);
      onCreated?.(newClient);
    }
    onOpenChange(false);
  };

  const isCompany = type === "juridiska";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Labot klientu" : "Jauns klients"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Atjaunini informāciju par klientu"
              : "Pievieno jaunu klientu savai klientu bāzei"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Client type segmented */}
          <div className="space-y-1.5">
            <Label>Klienta tips</Label>
            <div className="inline-flex items-center rounded-lg bg-graphite-100 p-1 border border-graphite-200/50">
              {(["juridiska", "fiziska"] as ClientType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={cn(
                    "relative rounded-md px-3 py-1 text-[12.5px] font-medium transition-colors",
                    type === t
                      ? "bg-white text-graphite-900 shadow-soft-xs"
                      : "text-graphite-500 hover:text-graphite-700"
                  )}
                >
                  {t === "juridiska" ? "Juridiska persona" : "Fiziska persona"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{isCompany ? "Nosaukums" : "Vārds, uzvārds"}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                isCompany ? "piem. SIA Nordic Drift" : "piem. John Smith"
              }
              autoFocus
            />
          </div>

          {isCompany && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Reģ. numurs</Label>
                <Input
                  value={regNumber}
                  onChange={(e) => setRegNumber(e.target.value)}
                  placeholder="40003000000"
                />
              </div>
              <div className="space-y-1.5">
                <Label>PVN numurs</Label>
                <Input
                  value={vatNumber}
                  onChange={(e) => setVatNumber(e.target.value)}
                  placeholder="LV40003000000"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{isCompany ? "Juridiskā adrese" : "Adrese"}</Label>
            <Input
              value={legalAddress}
              onChange={(e) => setLegalAddress(e.target.value)}
              placeholder="Iela, pilsēta, pasta indekss"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valsts</Label>
              <Select value={countryCode} onValueChange={setCountryCode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Bankas konts (IBAN)</Label>
              <Input
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
                placeholder="LV00BANK0000000000000"
                className="font-mono text-[12px]"
              />
            </div>
          </div>

          {/* Keywords */}
          <div className="space-y-1.5">
            <Label>Atslēgvārdi</Label>
            <div
              className={cn(
                "flex flex-wrap items-center gap-1.5 min-h-[36px] rounded-lg border border-graphite-200 bg-white px-2 py-1.5 transition-colors focus-within:border-graphite-900 focus-within:ring-2 focus-within:ring-graphite-900/5"
              )}
            >
              {keywords.map((k) => (
                <Badge
                  key={k}
                  variant="default"
                  className="gap-1 cursor-pointer hover:bg-graphite-200"
                  onClick={() => removeKeyword(k)}
                >
                  {k}
                  <X className="h-2.5 w-2.5" />
                </Badge>
              ))}
              <input
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => keywordInput && commitKeyword()}
                placeholder={
                  keywords.length === 0
                    ? "piem. drift, noma, konsultācija"
                    : ""
                }
                className="flex-1 min-w-[120px] text-[13px] outline-none bg-transparent placeholder:text-graphite-400"
              />
            </div>
            <p className="text-[11px] text-graphite-500">
              Atdali ar komatu. Atslēgvārdi palīdz atrast klientu, kad izraksti rēķinu.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Atcelt
          </Button>
          <Button size="sm" onClick={submit} disabled={!name.trim()}>
            <Save className="h-3.5 w-3.5" />
            {editing ? "Saglabāt" : "Pievienot klientu"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
