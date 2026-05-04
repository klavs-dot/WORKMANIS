"use client";

/**
 * AddCompanyModal — form for provisioning a new company through
 * POST /api/companies/create. On submit:
 *   1. Validates required fields client-side
 *   2. Shows a full-form loading state (provisioning takes ~10-20s
 *      due to 25 Sheets tabs + 18 Drive folders being created)
 *   3. On success: calls onCreated callback with the new company
 *      metadata, which the parent uses to refresh its state, then
 *      saves the requisites (color, addresses, emails, etc.) via a
 *      separate PUT to /api/companies/requisites
 *   4. On failure: shows the server error inline with a retry option
 *
 * The provisioning API call makes real Drive + Sheets API calls to
 * the user's Google account — every submit creates actual files.
 * This is NOT a dry run. The 'Atcelt' button only works before
 * submission; once the API call is in flight, cancel is disabled
 * because we can't undo partial Drive creation.
 *
 * Two-step save flow:
 *   /api/companies/create  → creates Drive + Sheets, returns IDs
 *   /api/companies/requisites → fills in the rich requisite fields
 *
 * We split because the create endpoint validates only the bare
 * minimum (name, legal_name, reg_number) needed to provision
 * infrastructure; the rest are optional and live in 01_requisites.
 * If the requisites save fails, we still consider the company
 * created — the user can fill the rest in via the edit modal.
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
  Lock,
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
import { BrandColorPicker } from "./brand-color-picker";
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
  onCreated: (company: CreatedCompany, extras: ExtraRequisites) => void;
}

/**
 * Extra fields beyond what /api/companies/create accepts. Caller
 * receives these so it can update local state with the full
 * Company shape (the create endpoint only knows about Drive +
 * Sheet provisioning; rich requisites are written separately).
 */
export interface ExtraRequisites {
  brandColor?: string;
  legalAddress?: string;
  deliveryAddress?: string;
  contactEmail?: string;
  invoiceEmail?: string;
  iban?: string;
  bankName?: string;
  swift?: string;
  phone?: string;
  website?: string;
}

type SubmitState =
  | { stage: "idle" }
  | { stage: "submitting" }
  | { stage: "saving_requisites" }
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
  const [legalAddress, setLegalAddress] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [iban, setIban] = useState("");
  const [bankName, setBankName] = useState("");
  const [swift, setSwift] = useState("");
  const [phone, setPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [invoiceEmail, setInvoiceEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [brandColor, setBrandColor] = useState("");
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
    setLegalAddress("");
    setDeliveryAddress("");
    setIban("");
    setBankName("");
    setSwift("");
    setPhone("");
    setContactEmail("");
    setInvoiceEmail("");
    setWebsite("");
    setBrandColor("");
    setDirectorName("");
    setDirectorPosition("Valdes loceklis");
  };

  const isSubmitting =
    submitState.stage === "submitting" ||
    submitState.stage === "saving_requisites";
  const isSuccess = submitState.stage === "success";

  const canSubmit =
    name.trim().length > 0 &&
    legalName.trim().length > 0 &&
    regNumber.trim().length > 0 &&
    !isSubmitting &&
    !isSuccess;

  /**
   * NEW FLOW (Phase 2/3 OAuth architecture):
   *
   *   1. POST form data to /api/companies/oauth/init
   *      → Server signs the data into a state token + returns
   *        Google's OAuth consent URL
   *
   *   2. We redirect the WHOLE PAGE to that URL
   *      → User picks which Gmail account owns this company
   *      → User approves Drive + Sheets + Gmail access
   *
   *   3. Google redirects to /api/companies/oauth/callback
   *      → Callback exchanges code for tokens, provisions the
   *        company in the chosen Gmail's Drive, saves encrypted
   *        refresh token, redirects to /uznemumi?created=ID
   *
   *   4. /uznemumi page picks up the ?created=ID param and
   *      activates the new company + shows success toast
   *
   * Why full-page redirect instead of popup:
   *   - Popups get blocked by browsers in many contexts
   *     (especially after async operations like a fetch call)
   *   - The state token carries all form data so nothing is
   *     lost on the round-trip
   *   - Mobile Safari handles redirects much more reliably
   *     than popups
   *
   * The user briefly leaves the app, sees Google's screen,
   * and returns. Total round-trip: ~10-30 seconds depending on
   * how long they spend on consent.
   */
  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitState({ stage: "submitting" });

    try {
      // Build the form payload — same data we used to send to
      // /create, now packaged for the OAuth state token.
      const payload = {
        name: name.trim(),
        legal_name: legalName.trim(),
        reg_number: regNumber.trim(),
        vat_number: vatNumber.trim() || undefined,
        legal_address: legalAddress.trim() || undefined,
        delivery_address: deliveryAddress.trim() || undefined,
        contact_email: contactEmail.trim() || undefined,
        invoice_email: invoiceEmail.trim() || undefined,
        iban: iban.replace(/\s/g, "").toUpperCase() || undefined,
        bank_name: bankName.trim() || undefined,
        swift: swift.trim() || undefined,
        phone: phone.trim() || undefined,
        website: website.trim() || undefined,
        brand_color: brandColor || undefined,
      };

      const response = await fetch("/api/companies/oauth/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errBody = await response
          .json()
          .catch(() => ({ error: `HTTP ${response.status}` }));
        setSubmitState({
          stage: "error",
          message:
            typeof errBody?.error === "string"
              ? errBody.error
              : `Servera kļūda (${response.status})`,
        });
        return;
      }

      const data = (await response.json()) as { oauthUrl?: string };
      if (!data.oauthUrl) {
        setSubmitState({
          stage: "error",
          message: "Servers neatgrieza OAuth URL",
        });
        return;
      }

      // Redirect the whole page to Google. We don't reset form
      // state because the state token already has all the data —
      // the user will land back on /uznemumi when they're done.
      window.location.href = data.oauthUrl;
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
    if (isSuccess) {
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
            Aizpildi rekvizītus jaunajai struktūrvienībai. Drive mape un
            Sheets dokuments tiks izveidoti automātiski.
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
                Pārvirzām uz Google…
              </h3>
              <p className="mt-1 text-[12.5px] text-graphite-500 max-w-sm mx-auto leading-relaxed">
                Izvēlies, kuru Gmail kontu šim uzņēmumam piesaistīt. Tava
                uzņēmuma faili tiks izveidoti tā Google Drive kontā.
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
              {/* Privacy notice — explains what creating a company
                  does to the user's Google Drive + Gmail. Critical
                  for trust before they hit submit. */}
              <PrivacyNotice />

              {/* Brand color — picked early because the user sees
                  the result instantly in the sidebar */}
              <div className="rounded-lg border border-graphite-200 p-4 space-y-2">
                <p className="text-[10.5px] uppercase tracking-wider text-graphite-500 font-semibold">
                  Krāsa sānu izvēlnei
                </p>
                <p className="text-[11px] text-graphite-500 leading-relaxed">
                  Šī krāsa parādīsies sānu izvēlnē, kad strādāsi ar
                  šo uzņēmumu — viegli atšķirsi, kurā struktūrvienībā
                  patlaban atrodies.
                </p>
                <BrandColorPicker
                  value={brandColor}
                  onChange={setBrandColor}
                />
              </div>

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

              {/* Adreses */}
              <div className="rounded-lg border border-graphite-200 p-4 space-y-3">
                <p className="text-[10.5px] uppercase tracking-wider text-graphite-500 font-semibold">
                  Adreses
                </p>

                <div className="space-y-1.5">
                  <Label>Juridiskā adrese</Label>
                  <Input
                    value={legalAddress}
                    onChange={(e) => setLegalAddress(e.target.value)}
                    placeholder="Iela, pilsēta, pasta indekss, valsts"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Faktiskā / piegādes adrese</Label>
                  <Input
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Ja atšķiras no juridiskās"
                  />
                  <p className="text-[10.5px] text-graphite-500">
                    Atstāj tukšu, ja sakrīt ar juridisko adresi
                  </p>
                </div>
              </div>

              {/* Sakari */}
              <div className="rounded-lg border border-graphite-200 p-4 space-y-3">
                <p className="text-[10.5px] uppercase tracking-wider text-graphite-500 font-semibold">
                  Sakari
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>E-pasts saziņai</Label>
                    <Input
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="info@company.com"
                      type="email"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>E-pasts rēķiniem</Label>
                    <Input
                      value={invoiceEmail}
                      onChange={(e) => setInvoiceEmail(e.target.value)}
                      placeholder="rekini@company.com"
                      type="email"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Telefona numurs</Label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+371 00 000 000"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Mājaslapa</Label>
                    <Input
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://company.com"
                    />
                  </div>
                </div>
              </div>

              {/* Bankas rekvizīti */}
              <div className="rounded-lg border border-graphite-200 p-4 space-y-3">
                <p className="text-[10.5px] uppercase tracking-wider text-graphite-500 font-semibold">
                  Bankas rekvizīti
                </p>

                <div className="space-y-1.5">
                  <Label>IBAN</Label>
                  <Input
                    value={iban}
                    onChange={(e) => setIban(e.target.value)}
                    placeholder="LV61HABA0001408042678"
                    className="font-mono text-[12.5px]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Bankas nosaukums</Label>
                    <Input
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="Swedbank AS"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>SWIFT</Label>
                    <Input
                      value={swift}
                      onChange={(e) => setSwift(e.target.value)}
                      placeholder="HABALV22"
                      className="font-mono text-[12.5px]"
                    />
                  </div>
                </div>
              </div>

              {/* Direktors */}
              <div className="rounded-lg border border-graphite-200 p-4 space-y-3">
                <p className="text-[10.5px] uppercase tracking-wider text-graphite-500 font-semibold">
                  Atbildīgā persona (neobligāti)
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Vārds, uzvārds</Label>
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

/**
 * Privacy notice shown at the top of the create-company form.
 * Explains in plain Latvian what creating a company does to the
 * user's Google account, and what WORKMANIS does NOT see/store.
 *
 * Critical for trust — the user is about to grant us access to
 * Drive + Gmail; they should know exactly what that means before
 * they hit submit.
 *
 * Visually styled as an info card (not a wall of disclaimer text)
 * so it gets read instead of skipped.
 */
function PrivacyNotice() {
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Lock className="h-3.5 w-3.5 text-blue-700" />
        <p className="text-[11.5px] uppercase tracking-wider text-blue-900 font-semibold">
          Kā Workmanis strādā ar taviem datiem
        </p>
      </div>
      <ul className="space-y-1.5 text-[11.5px] text-blue-900 leading-relaxed">
        <li className="flex gap-2">
          <span className="text-blue-500 shrink-0">•</span>
          <span>
            Tava Google Drive kontā Workmanis automātiski izveidos
            atsevišķu mapi failiem un Google Sheets dokumentu, kurā
            tiks glabāti visi rēķini un saistītie dati.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-blue-500 shrink-0">•</span>
          <span>
            Dokumenti paliks tava Google Drive kontā, tāpēc tiem
            varēsi piekļūt arī tad, ja kādreiz vairs nelietosi
            Workmanis.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-blue-500 shrink-0">•</span>
          <span>
            Pievienojot e-pastu, tu atļauj Workmanis AI droši
            pārskatīt šo e-pastu, lai tas varētu automātiski atrast
            un ievilkt rēķinus sistēmā.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-blue-500 shrink-0">•</span>
          <span className="font-medium">
            Workmanis neredz un neglabā tavus failus savos serveros —
            viss paliek tava Google kontā.
          </span>
        </li>
      </ul>
    </div>
  );
}
