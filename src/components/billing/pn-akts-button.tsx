"use client";

import { useRef, useState } from "react";
import { FilePlus2, Upload, Sparkles, ChevronDown, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { generateNumber, pnNumberLabel } from "@/lib/number-generator";

export function PnAktsButton({
  current,
  onAttach,
  onRemove,
}: {
  /** Current PN akts number (e.g. PN190426-1), or undefined when not yet attached */
  current?: string;
  /** Called when user generates (mode=generate) or uploads (mode=upload) a PN akts */
  onAttach: (data: { number: string; source: "generated" | "uploaded"; fileName?: string }) => void;
  /** Called when user removes the current PN akts */
  onRemove?: () => void;
}) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Attached state: show the badge + dropdown for options ───
  if (current) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 px-2 py-1 text-[10.5px] font-semibold text-indigo-700 font-mono transition-colors"
            title={pnNumberLabel(current)}
          >
            <FilePlus2 className="h-3 w-3" />
            {current}
            <ChevronDown className="h-2.5 w-2.5 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[200px]">
          <DropdownMenuItem disabled className="text-[10.5px] uppercase tracking-wider text-graphite-400 font-semibold">
            PN akts pievienots
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <Download className="h-3.5 w-3.5 text-graphite-500" />
            Lejupielādēt PN aktu
          </DropdownMenuItem>
          {onRemove && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600 focus:text-red-700"
                onSelect={() => onRemove()}
              >
                <X className="h-3.5 w-3.5" />
                Noņemt PN aktu
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // ─── Not attached: show dropdown with 2 options ───
  const handleGenerate = () => {
    const num = generateNumber("pn_akts");
    onAttach({ number: num, source: "generated" });
  };

  const handleFileChosen = (file: File) => {
    // Still assign a number so the record has a handle, but mark it as uploaded
    const num = generateNumber("pn_akts");
    onAttach({ number: num, source: "uploaded", fileName: file.name });
    setUploadOpen(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" title="Pievienot PN aktu">
            <FilePlus2 className="h-3 w-3" />
            Pievienot PN
            <ChevronDown className="h-2.5 w-2.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[220px]">
          <DropdownMenuItem onSelect={handleGenerate}>
            <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
            <div className="flex flex-col items-start leading-tight">
              <span className="text-[12.5px] font-medium">Ģenerēt PN aktu</span>
              <span className="text-[10.5px] text-graphite-400">
                Izveidot jaunu ar automātisku numuru
              </span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setUploadOpen(true)}>
            <Upload className="h-3.5 w-3.5 text-emerald-600" />
            <div className="flex flex-col items-start leading-tight">
              <span className="text-[12.5px] font-medium">
                Augšupielādēt PN aktu
              </span>
              <span className="text-[10.5px] text-graphite-400">
                Pievienot esošu PDF failu
              </span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-emerald-600" />
              Augšupielādēt PN aktu
            </DialogTitle>
            <DialogDescription>
              Pievieno jau parakstīta PN akta PDF failu. Nākotnē fails tiks
              saglabāts Google Drive uzņēmuma mapē.
            </DialogDescription>
          </DialogHeader>

          <div
            className="mt-2 rounded-lg border-2 border-dashed border-graphite-200 bg-graphite-50/40 p-6 text-center cursor-pointer hover:border-graphite-300 hover:bg-graphite-50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-6 w-6 text-graphite-400 mx-auto mb-2" />
            <p className="text-[13px] font-medium text-graphite-900">
              Izvēlies failu
            </p>
            <p className="text-[11.5px] text-graphite-500 mt-0.5">
              PDF · maks. 10 MB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileChosen(f);
              }}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-graphite-100 mt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setUploadOpen(false)}
            >
              Atcelt
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
