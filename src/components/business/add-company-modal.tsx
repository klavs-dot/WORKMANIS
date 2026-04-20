"use client";

/**
 * AddCompanyModal — form for provisioning a new company through
 * POST /api/companies/create. On submit:
 *   1. Validates required fields client-side
 *   2. Shows a full-form loading state (provisioning takes ~10-20s
 *      due to 25 Sheets tabs + 18 Drive folders being created)
 *   3. On success: calls onCreated callback with the new company
 *      metadata, which the parent uses to refresh its state
 *   4. On failure: shows the server error inline with a retry option
 *
 * The provisioning API call makes real Drive + Sheets API calls to
 * the user's Google account — every submit creates actual files.
 * This is NOT a dry run. The 'Atcelt' button only works before
 * submission; once the API call is in flight, cancel is disabled
 * because we can't undo partial Drive creation.
 */

import { useEffect, useState } from "react";
import {
  Loader2,
  Building2,
  AlertCircle,
  CheckCircle2,
  FolderPlus,
  Save,
  X,
} from "lucide-react";
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

export interface CreatedCompany {
  id: string;
  slug: string;
  folderId: string;
  sheetId: string;
  name: string;
  legalName: string;
  regNumber: string;
  vatNumber: string | null;
}

interface AddCompanyModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (company: CreatedCompany) => void;
}

type SubmitState =
  | { stage: "idle" }
  | { stage: "submitting" }
  | { stage: "success"; company: CreatedCompany }
  | { stage: "error"; message: string };

export function AddCompanyModal({
  open,
  onOpenChange,
  onCreated,
}: AddCompanyModalProps) {
  // ─── Form state ───
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [regNumber, setRegNumber] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [address, setAddress] = useState("");
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [directorName, setDirectorName] = useState("");
  const [directorPosition, setDirectorPosition] =
    useState("Valdes loceklis");

  const [submitState, setSubmitState] = useState<SubmitState>({
    stage: "idle",
  });

  // Reset state when modal reopens
  useEffect(() => {
    if (open) {
      setSubmitState({ stage: "idle" });
    }
  }, [open]);

  const resetForm = () => {
    setName("");
    setLegalName("");
    setRegNumber("");
    setVatNumber("");
    setAddress("");
    setIban("");
    setBic("");
    setPhone("");
    setEmail("");
    setWebsite("");
    setDirectorName("");
    setDirectorPosition("Valdes loceklis");
  };

  const isSubmitting = submitState.stage === "submitting";
  const isSuccess = submitState.stage === "success";

  const canSubmit =
    name.trim().length > 0 &&
    legalName.trim().length > 0 &&
    regNumber.trim().length > 0 &&
    !isSubmitting &&
    !isSuccess;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitState({ stage: "submitting" });

    try {
      const response = await fetch("/api/companies/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          legal_name: legalName.trim(),
          reg_number: regNumber.trim(),
          vat_number: vatNumber.trim() || undefined,
          address: address.trim() || undefined,
          iban: iban.replace(/\s/g, "").toUpperCase() || undefined,
          bic: bic.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          website: website.trim() || undefined,
          director_name: directorName.trim() || undefined,
          director_position: directorPosition.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        setSubmitState({
          stage: "error",
          message: data.error ?? "Neparedzēta kļūda",
        });
        return;
      }

      setSubmitState({ stage: "success", company: data.company });
      onCreated(data.company);

      // Auto-close after 2s success state
      setTimeout(() => {
        onOpenChange(false);
        resetForm();
      }, 2000);
    } catch (err) {
      setSubmitState({
        stage: "error",
        message: err instanceof Error ? err.message : "Tīkla kļūda",
      });
    }
  };

  const handleClose = () => {
    if (isSubmitting) return; // don't allow close mid-flight
    onOpenChange(false);
    // Reset form on close
    if (!isSuccess) {
      // keep data if user might retry
    } else {
      resetForm();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-graphite-500" />
            Pievienot uzņēmumu
          </DialogTitle>
          <DialogDescription>
            Pievienojiet uzņēmumu vai struktūrvienību. Google Drive automātiski
            tiks izveidota mapju struktūra un Sheets datu fails.
          </DialogDescription>
        </DialogHeader>

        {/* ─── Success state ─── */}
        {isSuccess && (
          <div className="py-8 text-center space-y-3">
            <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-2xl bg-emerald-50 border border-emerald-100">
              <CheckCircle2
                className="h-6 w-6 text-emerald-600"
                strokeWidth={2}
              />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold tracking-tight text-graphite-900">
                Uzņēmums izveidots
              </h3>
              <p className="mt-1 text-[12.5px] text-graphite-500">
                {submitState.stage === "success" && submitState.company.name} ·
                Google Drive mape un Sheets fails ir gatavi
              </p>
            </div>
          </div>
        )}

        {/* ─── Submitting loading state ─── */}
        {isSubmitting && (
          <div className="py-8 text-center space-y-3">
            <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-2xl bg-graphite-100">
              <Loader2
                className="h-6 w-6 text-graphite-600 animate-spin"
                strokeWidth={2}
              />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold tracking-tight text-graphite-900">
                Izveidojam uzņēmumu…
              </h3>
              <p className="mt-1 text-[12.5px] text-graphite-500 max-w-sm mx-auto leading-relaxed">
                Veidojam Drive mapju struktūru un Sheets failu ar 25 tabām.
                Tas var aizņemt 10–20 sekundes.
              </p>
            </div>
            <div className="flex flex-col gap-1.5 items-center text-[11px] text-graphite-400 max-w-xs mx-auto">
              <div className="flex items-center gap-1.5">
                <FolderPlus className="h-3 w-3" />
                WORKMANIS/accounts/…/companies/
              </div>
            </div>
          </div>
        )}

        {/* ─── Form ─── */}
        {!isSuccess && !isSubmitting && (
          <>
            <div className="space-y-3 pt-2">
              {/* Required section */}
              <div className="rounded-lg border border-graphite-200 bg-graphite-50/40 p-4 space-y-3">
                <p className="text-[10.5px] uppercase tracking-wider text-graphite-500 font-semibold">
                  Obligātie rekvizīti
                </p>

                <div className="space-y-1.5">
                  <Label>
                    Nosaukums <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="piem. Mosphera"
                    autoFocus
                  />
                  <p className="text-[10.5px] text-graphite-500">
                    Īsais UI nosaukums, ko redzēsi sānjoslā
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label>
                    Juridiskais nosaukums{" "}
                    <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    placeholder="piem. SIA Global Wolf Motors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>
                      Reģ. Nr. <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={regNumber}
                      onChange={(e) => setRegNumber(e.target.value)}
                      placeholder="40103456789"
                      className="font-mono text-[12.5px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>PVN Nr.</Label>
                    <Input
                      value={vatNumber}
                      onChange={(e) => setVatNumber(e.target.value)}
                      placeholder="LV40103456789"
                      className="font-mono text-[12.5px]"
                    />
                  </div>
                </div>
              </div>

              {/* Optional section */}
              <div className="rounded-lg border border-graphite-200 p-4 space-y-3">
                <p className="text-[10.5px] uppercase tracking-wider text-graphite-500 font-semibold">
                  Papildu rekvizīti (neobligāti)
                </p>

                <div className="space-y-1.5">
                  <Label>Juridiskā adrese</Label>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Bāriņu iela 5, Liepāja, LV-3401"
                  />
                </div>

                <div className="grid grid-cols-[2fr_1fr] gap-3">
                  <div className="space-y-1.5">
                    <Label>IBAN</Label>
                    <Input
                      value={iban}
                      onChange={(e) => setIban(e.target.value)}
                      placeholder="LV61HABA0001408042678"
                      className="font-mono text-[12.5px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>BIC/SWIFT</Label>
                    <Input
                      value={bic}
                      onChange={(e) => setBic(e.target.value)}
                      placeholder="HABALV22"
                      className="font-mono text-[12.5px]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Tālrunis</Label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+371 28000000"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>E-pasts</Label>
                    <Input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="info@mosphera.com"
                      type="email"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Mājaslapa</Label>
                  <Input
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://mosphera.com"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Valdes loceklis</Label>
                    <Input
                      value={directorName}
                      onChange={(e) => setDirectorName(e.target.value)}
                      placeholder="Klāvs Bērziņš"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Pozīcija</Label>
                    <Input
                      value={directorPosition}
                      onChange={(e) => setDirectorPosition(e.target.value)}
                      placeholder="Valdes loceklis"
                    />
                  </div>
                </div>
              </div>

              {/* Error state */}
              {submitState.stage === "error" && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100">
                  <AlertCircle
                    className={cn(
                      "h-4 w-4 shrink-0 mt-0.5 text-red-600"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-red-800">
                      Kļūda
                    </p>
                    <p className="text-[11.5px] text-red-700 mt-0.5 leading-relaxed">
                      {submitState.message}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-graphite-100 mt-4">
              <Button variant="ghost" size="sm" onClick={handleClose}>
                <X className="h-3.5 w-3.5" />
                Atcelt
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                <Save className="h-3.5 w-3.5" />
                Izveidot uzņēmumu
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
