"use client";

/**
 * RequisitesModal — full company details editor.
 *
 * On open:
 *   - Fetches the latest requisites from /api/companies/requisites
 *     so the form shows the current persisted state (not a stale
 *     subset from the companies-list endpoint).
 *
 * On save:
 *   - Calls saveRequisites() which PUTs to the API and updates
 *     local state on success. Surfaces server errors via toast.
 *
 * Logo upload:
 *   - Opens a file picker for PNG/SVG/JPG/WebP
 *   - Uploads to Drive at logos/<filename>
 *   - Stores the returned Drive file ID in logoDriveId
 *   - The actual logo is rendered via /api/drive/files/{id} so it
 *     updates everywhere immediately (sidebar, company list, etc.)
 *
 * Why fetch on open instead of relying on company state:
 *   The companies-list endpoint only returns id/slug/name/
 *   legalName/regNumber/vatNumber + sheet+folder ids. The full
 *   requisites (addresses, bank info, email) live in the
 *   company's own sheet, accessed via this dedicated endpoint.
 */

import { useEffect, useRef, useState } from "react";
import { Save, X, Upload, Loader2, Check } from "lucide-react";
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
import { useCompany } from "@/lib/company-context";
import {
  uploadFileToDrive,
  buildDriveFileUrl,
} from "@/lib/drive-files";
import { pushToastGlobally } from "@/lib/toast-context";
import { cn } from "@/lib/utils";
import type { Company } from "@/lib/types";

interface RequisitesModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  company: Company | null;
}

export function RequisitesModal({
  open,
  onOpenChange,
  company,
}: RequisitesModalProps) {
  const { saveRequisites, loadRequisites } = useCompany();

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
  const [logoDriveId, setLogoDriveId] = useState("");

  const [loadingRequisites, setLoadingRequisites] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load fresh data when modal opens. We use the company's existing
  // fields as initial paint (so the form doesn't flash blank), then
  // fetch the full requisites and update.
  useEffect(() => {
    if (!open || !company) return;

    // Initial paint from local company state
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
    setLogoDriveId(company.logoDriveId ?? "");

    // Fetch fresh from API (updates form fields if remote has more)
    setLoadingRequisites(true);
    void loadRequisites(company.id)
      .then((fresh) => {
        if (fresh.name) setName(fresh.name);
        if (fresh.legalName) setLegalName(fresh.legalName);
        if (fresh.regNumber) setRegNumber(fresh.regNumber);
        if (fresh.vatNumber) setVatNumber(fresh.vatNumber);
        if (fresh.legalAddress) setLegalAddress(fresh.legalAddress);
        if (fresh.deliveryAddress) setDeliveryAddress(fresh.deliveryAddress);
        if (fresh.contactEmail) setContactEmail(fresh.contactEmail);
        if (fresh.invoiceEmail) setInvoiceEmail(fresh.invoiceEmail);
        if (fresh.iban) setIban(fresh.iban);
        if (fresh.bankName) setBankName(fresh.bankName);
        if (fresh.swift) setSwift(fresh.swift);
        if (fresh.phone) setPhone(fresh.phone);
        if (fresh.website) setWebsite(fresh.website);
        if (fresh.logoDriveId) setLogoDriveId(fresh.logoDriveId);
      })
      .finally(() => setLoadingRequisites(false));
  }, [open, company, loadRequisites]);

  const handleLogoFile = async (file: File) => {
    if (!company) return;

    // Validate type
    const allowed = [".png", ".svg", ".jpg", ".jpeg", ".webp"];
    const lower = file.name.toLowerCase();
    if (!allowed.some((ext) => lower.endsWith(ext))) {
      pushToastGlobally(
        "error",
        "Atļauti tikai PNG, SVG, JPG vai WebP faili.",
        6000
      );
      return;
    }
    // 5 MB sanity cap — logos shouldn't be huge
    if (file.size > 5 * 1024 * 1024) {
      pushToastGlobally(
        "error",
        "Logo nedrīkst pārsniegt 5 MB.",
        6000
      );
      return;
    }

    setUploadingLogo(true);
    try {
      // Logos go into a dedicated 'logos' subfolder under the
      // company root. Year/month organization doesn't help here
      // (logos are rare and persist across years), so it's a
      // single flat folder.
      const result = await uploadFileToDrive(file, "logos", company.id);
      setLogoDriveId(result.fileId);
      pushToastGlobally("success", "Logo augšupielādēts", 4000);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Augšupielāde neizdevās";
      pushToastGlobally("error", msg, 7000);
    } finally {
      setUploadingLogo(false);
    }
  };

  const submit = async () => {
    if (!company) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      pushToastGlobally("error", "Nosaukums nedrīkst būt tukšs", 5000);
      return;
    }

    setSaving(true);
    try {
      await saveRequisites(company.id, {
        name: trimmedName,
        legalName: legalName.trim() || undefined,
        regNumber: regNumber.trim() || undefined,
        vatNumber: vatNumber.trim() || undefined,
        legalAddress: legalAddress.trim() || undefined,
        deliveryAddress: deliveryAddress.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        invoiceEmail: invoiceEmail.trim() || undefined,
        iban: iban.trim() || undefined,
        bankName: bankName.trim() || undefined,
        swift: swift.trim() || undefined,
        phone: phone.trim() || undefined,
        website: website.trim() || undefined,
        logoDriveId: logoDriveId || undefined,
      });
      pushToastGlobally("success", "Rekvizīti saglabāti", 3500);
      onOpenChange(false);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Saglabāšana neizdevās";
      pushToastGlobally("error", msg, 8000);
    } finally {
      setSaving(false);
    }
  };

  const initials = (company?.name ?? "")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Build the logo preview URL when we have a Drive ID
  const logoPreviewUrl =
    company && logoDriveId
      ? buildDriveFileUrl(logoDriveId, company.id, "view")
      : null;

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
          {/* Logo upload */}
          <div>
            <Label>Logo</Label>
            <div className="mt-1.5 flex items-center gap-3">
              {logoPreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoPreviewUrl}
                  alt={company?.name ?? ""}
                  className="h-14 w-14 rounded-xl object-cover border border-graphite-200 bg-white"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-graphite-900 text-white text-[15px] font-semibold shadow-soft-sm">
                  {initials || "—"}
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.svg,.jpg,.jpeg,.webp,image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleLogoFile(f);
                  e.target.value = "";
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                type="button"
                disabled={uploadingLogo}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadingLogo ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Augšupielādē…
                  </>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5" />
                    {logoDriveId ? "Aizstāt logo" : "Augšupielādēt logo"}
                  </>
                )}
              </Button>
              {logoDriveId && !uploadingLogo && (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                  <Check className="h-3 w-3" />
                  Logo saglabāts
                </span>
              )}
              <p className="text-[11px] text-graphite-400 ml-auto">
                .png, .svg, .jpg · max 5 MB
              </p>
            </div>
          </div>

          {loadingRequisites && (
            <p className="text-[11.5px] text-graphite-400 italic">
              Ielādē rekvizītus no Sheets…
            </p>
          )}

          <Section title="Identifikācija">
            <Field
              label="Nosaukums (iekšējais)"
              value={name}
              onChange={setName}
              placeholder="piem. Global Wolf Motors"
            />
            <Field
              label="Juridiskais nosaukums"
              value={legalName}
              onChange={setLegalName}
              placeholder="SIA / UAB / OÜ …"
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Reģistrācijas numurs"
                value={regNumber}
                onChange={setRegNumber}
                mono
                placeholder="40003000000"
              />
              <Field
                label="PVN numurs"
                value={vatNumber}
                onChange={setVatNumber}
                mono
                placeholder="LV40003000000"
              />
            </div>
          </Section>

          <Section title="Adreses">
            <Field
              label="Juridiskā adrese"
              value={legalAddress}
              onChange={setLegalAddress}
              placeholder="Iela, pilsēta, pasta indekss, valsts"
            />
            <Field
              label="Faktiskā / piegādes adrese"
              value={deliveryAddress}
              onChange={setDeliveryAddress}
              placeholder="Ja atšķiras no juridiskās"
            />
          </Section>

          <Section title="Sakari">
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="E-pasts saziņai"
                value={contactEmail}
                onChange={setContactEmail}
                placeholder="info@company.com"
                type="email"
              />
              <Field
                label="E-pasts rēķiniem"
                value={invoiceEmail}
                onChange={setInvoiceEmail}
                placeholder="rekini@company.com"
                type="email"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Telefona numurs"
                value={phone}
                onChange={setPhone}
                placeholder="+371 00 000 000"
              />
              <Field
                label="Mājaslapa"
                value={website}
                onChange={setWebsite}
                placeholder="https://company.com"
              />
            </div>
          </Section>

          <Section title="Bankas rekvizīti">
            <Field
              label="IBAN"
              value={iban}
              onChange={setIban}
              mono
              placeholder="LV00HABA0000000000000"
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Bankas nosaukums"
                value={bankName}
                onChange={setBankName}
                placeholder="Swedbank AS"
              />
              <Field
                label="SWIFT"
                value={swift}
                onChange={setSwift}
                mono
                placeholder="HABALV22"
              />
            </div>
          </Section>
        </div>

        <div className="flex justify-end gap-2 pt-5 border-t border-graphite-100 mt-5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            <X className="h-3.5 w-3.5" />
            Atcelt
          </Button>
          <Button size="sm" onClick={submit} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saglabā…
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                Saglabāt
              </>
            )}
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
