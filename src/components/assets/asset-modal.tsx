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
  const [noteColor, setNoteColor] = useState<AssetNoteColor>("zala");

  useEffect(() => {
    if (open) {
      if (editing) {
        setName(editing.name);
        setComment(editing.comment);
        setStatus(editing.status);
        setNoteColor(editing.noteColor);
      } else {
        setName("");
        setComment("");
        setStatus("aktivs");
        setNoteColor("zala");
      }
    }
  }, [open, editing]);

  const submit = () => {
    if (!name.trim()) return;
    if (editing) {
      updateAsset(editing.id, { name: name.trim(), comment, status, noteColor });
    } else {
      addAsset({ category, name: name.trim(), comment, status, noteColor });
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

          <div className="grid grid-cols-2 gap-3">
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
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={cn(
                    "flex h-9 w-full items-center justify-between rounded-lg border border-graphite-200 bg-white px-3 py-2 text-[13.5px] text-graphite-800 transition-colors",
                    "hover:border-graphite-300",
                    "focus:outline-none focus:border-graphite-900 focus:ring-2 focus:ring-graphite-900/5"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        colorCfg.dot
                      )}
                    />
                    {noteColorLabels[noteColor]}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[10rem]"
                >
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
