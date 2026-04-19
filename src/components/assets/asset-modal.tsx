"use client";

import { useEffect, useState } from "react";
import { Save, X, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/primitives";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  useAssets,
  type Asset,
  type AssetCategory,
  type AssetNoteColor,
  type AssetStatus,
  noteColorClasses,
  noteColorLabels,
  statusLabels,
} from "@/lib/assets-store";

const categoryLabels: Record<AssetCategory, string> = {
  domeni: "domēnu",
  automasinas: "automašīnu",
  citi: "aktīvu",
};

interface AssetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: AssetCategory;
  editing?: Asset | null;
}

export function AssetModal({
  open,
  onOpenChange,
  category,
  editing,
}: AssetModalProps) {
  const { addAsset, updateAsset } = useAssets();

  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<AssetStatus>("aktivs");
  const [note, setNote] = useState("");
  const [noteColor, setNoteColor] = useState<AssetNoteColor>("zala");
  const [reminderDate, setReminderDate] = useState<string>("");

  useEffect(() => {
    if (open) {
      if (editing) {
        setName(editing.name);
        setComment(editing.comment);
        setStatus(editing.status);
        setNote(editing.note);
        setNoteColor(editing.noteColor);
        setReminderDate(editing.reminderDate ?? "");
      } else {
        setName("");
        setComment("");
        setStatus("aktivs");
        setNote("");
        setNoteColor("zala");
        setReminderDate("");
      }
    }
  }, [open, editing]);

  const submit = () => {
    if (!name.trim()) return;
    if (editing) {
      updateAsset(editing.id, {
        name: name.trim(),
        comment,
        status,
        note: note.trim(),
        noteColor,
        reminderDate: reminderDate || undefined,
      });
    } else {
      addAsset({
        category,
        name: name.trim(),
        comment,
        status,
        note: note.trim(),
        noteColor,
        reminderDate: reminderDate || undefined,
      });
    }
    onOpenChange(false);
  };

  const colorCfg = noteColorClasses[noteColor];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Labot aktīvu" : "Jauns aktīvs"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Mainīt datus par esošo ierakstu"
              : `Pievienot jaunu ${categoryLabels[category]} sarakstam`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 pt-1">
          <div className="space-y-1.5">
            <Label>Nosaukums</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="piem. wolftrike.eu"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Komentārs</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Īss apraksts par aktīvu"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Statuss</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as AssetStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(statusLabels) as AssetStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabels[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Piezīme</Label>
            <div className="flex gap-2">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="piem. Svarīgs, Rezervēts, Arhīvs…"
                className="flex-1"
              />
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Izvēlēties krāsu"
                  className={cn(
                    "flex h-9 w-[72px] items-center justify-center gap-1.5 rounded-lg border border-graphite-200 bg-white transition-colors",
                    "hover:border-graphite-300",
                    "focus:outline-none focus:border-graphite-900 focus:ring-2 focus:ring-graphite-900/5"
                  )}
                >
                  <span
                    className={cn(
                      "h-3 w-3 rounded-full",
                      colorCfg.dot
                    )}
                  />
                  <ChevronDown className="h-3.5 w-3.5 text-graphite-400" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[10rem]">
                  {(Object.keys(noteColorLabels) as AssetNoteColor[]).map(
                    (c) => (
                      <DropdownMenuItem
                        key={c}
                        onSelect={() => setNoteColor(c)}
                      >
                        <span
                          className={cn(
                            "h-2.5 w-2.5 rounded-full",
                            noteColorClasses[c].dot
                          )}
                        />
                        <span className="flex-1">{noteColorLabels[c]}</span>
                        {noteColor === c && (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </DropdownMenuItem>
                    )
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {note.trim().length > 0 && (
              <div className="pt-1">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium border",
                    colorCfg.bg,
                    colorCfg.text,
                    colorCfg.border
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      colorCfg.dot
                    )}
                  />
                  {note.trim()}
                </span>
              </div>
            )}
          </div>

          {/* Reminder date — flag this asset for attention from the chosen day */}
          <div className="space-y-1.5">
            <Label>Pievērst uzmanību no datuma</Label>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={reminderDate}
                onChange={(e) => setReminderDate(e.target.value)}
                className="flex-1"
              />
              {reminderDate && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setReminderDate("")}
                  aria-label="Notīrīt datumu"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <p className="text-[11px] text-graphite-500 leading-relaxed">
              Sākot ar šo datumu, aktīvs tiks izcelts ar sarkanu rāmi un
              parādīsies skaitā kreisajā navigācijā.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            <X className="h-3.5 w-3.5" />
            Atcelt
          </Button>
          <Button size="sm" onClick={submit} disabled={!name.trim()}>
            <Save className="h-3.5 w-3.5" />
            Saglabāt
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
