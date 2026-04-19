"use client";

import { useEffect, useState } from "react";
import { Save, X, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/primitives";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Company } from "@/lib/types";

interface RequisitesModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  company: Company | null;
  onSave: (patch: Partial<Company>) => void;
}

export function RequisitesModal({
  open,
  onOpenChange,
  company,
  onSave,
}: RequisitesModalProps) {
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [regNumber, setRegNumber] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [legalAddress, setLegalAddress] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [invoiceEmail, setInvoiceEmail] = useState("");
  const [iban, setIban] = useState("");
  const [bankName, setBankName] = useState("");
  const [swift, setSwift] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");

  useEffect(() => {
    if (!open || !company) return;
    setName(company.name ?? "");
    setLegalName(company.legalName ?? "");
    setRegNumber(company.regNumber ?? "");
    setVatNumber(company.vatNumber ?? "");
    setLegalAddress(company.legalAddress ?? "");
    setDeliveryAddress(company.deliveryAddress ?? "");
    setContactEmail(company.contactEmail ?? "");
    setInvoiceEmail(company.invoiceEmail ?? "");
    setIban(company.iban ?? "");
    setBankName(company.bankName ?? "");
    setSwift(company.swift ?? "");
    setPhone(company.phone ?? "");
    setWebsite(company.website ?? "");
  }, [open, company]);

  const submit = () => {
    if (!company) return;
    onSave({
      name: name.trim() || company.name,
      legalName: legalName.trim(),
      regNumber: regNumber.trim(),
      vatNumber: vatNumber.trim(),
      legalAddress: legalAddress.trim(),
      deliveryAddress: deliveryAddress.trim(),
      contactEmail: contactEmail.trim(),
      invoiceEmail: invoiceEmail.trim(),
      iban: iban.trim(),
      bankName: bankName.trim(),
      swift: swift.trim(),
      phone: phone.trim(),
      website: website.trim(),
    });
    onOpenChange(false);
  };

  const initials = (company?.name ?? "")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rekvizīti · {company?.name}</DialogTitle>
          <DialogDescription>
            Uzņēmuma / struktūrvienības pilni rekvizīti izmantošanai rēķinos
            un sarakstē
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Logo placeholder */}
          <div>
            <Label>Logo</Label>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-graphite-900 text-white text-[15px] font-semibold shadow-soft-sm">
                {initials || "—"}
              </div>
              <Button variant="secondary" size="sm" type="button">
                <Upload className="h-3.5 w-3.5" />
                Augšupielādēt logo
              </Button>
              <p className="text-[11px] text-graphite-400">
                .png vai .svg · drīzumā
              </p>
            </div>
          </div>

          <Section title="Identifikācija">
            <Field label="Nosaukums (iekšējais)" value={name} onChange={setName} placeholder="piem. Global Wolf Motors" />
            <Field label="Juridiskais nosaukums" value={legalName} onChange={setLegalName} placeholder="SIA / UAB / OÜ …" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Reģistrācijas numurs" value={regNumber} onChange={setRegNumber} mono placeholder="40003000000" />
              <Field label="PVN numurs" value={vatNumber} onChange={setVatNumber} mono placeholder="LV40003000000" />
            </div>
          </Section>

          <Section title="Adreses">
            <Field label="Juridiskā adrese" value={legalAddress} onChange={setLegalAddress} placeholder="Iela, pilsēta, pasta indekss, valsts" />
            <Field label="Faktiskā / piegādes adrese" value={deliveryAddress} onChange={setDeliveryAddress} placeholder="Ja atšķiras no juridiskās" />
          </Section>

          <Section title="Sakari">
            <div className="grid grid-cols-2 gap-3">
              <Field label="E-pasts saziņai" value={contactEmail} onChange={setContactEmail} placeholder="info@company.com" type="email" />
              <Field label="E-pasts rēķiniem" value={invoiceEmail} onChange={setInvoiceEmail} placeholder="rekini@company.com" type="email" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Telefona numurs" value={phone} onChange={setPhone} placeholder="+371 00 000 000" />
              <Field label="Mājaslapa" value={website} onChange={setWebsite} placeholder="https://company.com" />
            </div>
          </Section>

          <Section title="Bankas rekvizīti">
            <Field label="IBAN" value={iban} onChange={setIban} mono placeholder="LV00HABA0000000000000" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bankas nosaukums" value={bankName} onChange={setBankName} placeholder="Swedbank AS" />
              <Field label="SWIFT" value={swift} onChange={setSwift} mono placeholder="HABALV22" />
            </div>
          </Section>
        </div>

        <div className="flex justify-end gap-2 pt-5 border-t border-graphite-100 mt-5">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            <X className="h-3.5 w-3.5" />
            Atcelt
          </Button>
          <Button size="sm" onClick={submit}>
            <Save className="h-3.5 w-3.5" />
            Saglabāt
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-[10.5px] uppercase tracking-wider text-graphite-400 font-medium mb-2">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono,
  type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(mono && "font-mono text-[12.5px]")}
      />
    </div>
  );
}
