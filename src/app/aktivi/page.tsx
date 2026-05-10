"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe,
  Car,
  Package,
  Plus,
  Building,
  Wrench,
  Smartphone,
  Server,
  Briefcase,
  Tag,
  Box,
  X,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/business/headers";
import { AssetTab } from "@/components/assets/asset-tab";
import { useAssets } from "@/lib/assets-store";
import { useCustomCategories } from "@/lib/custom-categories";
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

const ICON_MAP: Record<
  string,
  React.ComponentType<{ className?: string; strokeWidth?: number }>
> = {
  Globe,
  Car,
  Package,
  Building,
  Wrench,
  Smartphone,
  Server,
  Briefcase,
  Tag,
  Box,
};

const PICKER_ICONS = [
  { name: "Building", Comp: Building, label: "Ēka" },
  { name: "Wrench", Comp: Wrench, label: "Tehnika" },
  { name: "Smartphone", Comp: Smartphone, label: "Telefons" },
  { name: "Server", Comp: Server, label: "Serveris" },
  { name: "Briefcase", Comp: Briefcase, label: "Bizness" },
  { name: "Tag", Comp: Tag, label: "Birka" },
  { name: "Box", Comp: Box, label: "Kaste" },
  { name: "Package", Comp: Package, label: "Pakete" },
];

interface TabDef {
  key: string;
  label: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  emptyTitle: string;
  emptyDescription: string;
  builtin: boolean;
}

const BUILTIN_TABS: TabDef[] = [
  {
    key: "domeni",
    label: "Domēni",
    Icon: Globe,
    emptyTitle: "Nav pievienotu domēnu",
    emptyDescription:
      "Pievienojiet savus domēnus, lai sekotu līdzi to atjaunošanai un statusam.",
    builtin: true,
  },
  {
    key: "automasinas",
    label: "Automašīnas",
    Icon: Car,
    emptyTitle: "Nav pievienotu automašīnu",
    emptyDescription:
      "Pievienojiet uzņēmuma transportlīdzekļus, lai uzturētu to pārskatu.",
    builtin: true,
  },
  {
    key: "citi",
    label: "Citi",
    Icon: Package,
    emptyTitle: "Nav pievienotu aktīvu",
    emptyDescription:
      "Pievienojiet iekārtas, tehniku un citus uzņēmuma īpašumus.",
    builtin: true,
  },
];

export default function AktiviPage() {
  const [tab, setTab] = useState<string>("domeni");
  const { getByCategory } = useAssets();
  const { categories: customCategories, add, remove } =
    useCustomCategories("aktivi");
  const [showAddDialog, setShowAddDialog] = useState(false);

  const allTabs: TabDef[] = useMemo(
    () => [
      ...BUILTIN_TABS,
      ...customCategories.map<TabDef>((c) => ({
        key: c.key,
        label: c.label,
        Icon: ICON_MAP[c.iconName] ?? Tag,
        emptyTitle: `Nav pievienotu (${c.label.toLowerCase()})`,
        emptyDescription: `Pievienojiet aktīvus kategorijā «${c.label}», lai sekotu to statusam.`,
        builtin: false,
      })),
    ],
    [customCategories]
  );

  const activeTab = allTabs.find((t) => t.key === tab) ?? BUILTIN_TABS[0];

  const handleRemoveCategory = (key: string) => {
    if (tab === key) setTab("domeni");
    remove(key);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Aktīvi"
          description="Uzņēmuma īpašumu un resursu uzskaite — domēni, transportlīdzekļi un cita tehnika"
          actions={
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddDialog(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Jauna kategorija
            </Button>
          }
        />

        <div className="overflow-x-auto -mx-1 px-1">
          <div
            role="tablist"
            className="inline-flex items-center gap-0.5 rounded-xl bg-graphite-100 p-1 border border-graphite-200/50"
          >
            {allTabs.map((t) => {
              const Icon = t.Icon;
              const isActive = tab === t.key;
              const count = getByCategory(t.key).length;
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "group relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-graphite-900/10 whitespace-nowrap",
                    isActive
                      ? "text-graphite-900"
                      : "text-graphite-500 hover:text-graphite-700"
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="aktivi-segmented-pill"
                      className="absolute inset-0 rounded-lg bg-white shadow-soft-xs border border-graphite-200/40"
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 40,
                      }}
                    />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                    {t.label}
                    {count > 0 && (
                      <span
                        className={cn(
                          "ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular",
                          isActive
                            ? "bg-graphite-900 text-white"
                            : "bg-graphite-200/70 text-graphite-600"
                        )}
                      >
                        {count}
                      </span>
                    )}
                    {!t.builtin && isActive && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            window.confirm(
                              `Dzēst kategoriju «${t.label}»?`
                            )
                          ) {
                            handleRemoveCategory(t.key);
                          }
                        }}
                        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded text-graphite-500 hover:bg-graphite-200 hover:text-graphite-900"
                      >
                        <X className="h-3 w-3" />
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <AssetTab
              key={activeTab.key}
              category={activeTab.key}
              icon={activeTab.Icon as never}
              emptyTitle={activeTab.emptyTitle}
              emptyDescription={activeTab.emptyDescription}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      <AddCategoryDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAdd={(label, iconName) => {
          const created = add(label, iconName);
          setTab(created.key);
          setShowAddDialog(false);
        }}
      />
    </AppShell>
  );
}

function AddCategoryDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdd: (label: string, iconName: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [iconName, setIconName] = useState("Tag");

  const handleSubmit = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    onAdd(trimmed, iconName);
    setLabel("");
    setIconName("Tag");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Jauna kategorija</DialogTitle>
          <DialogDescription>
            Pievieno savu kategoriju aktīviem (piem., &ldquo;Datortehnika&rdquo;,
            &ldquo;Mēbeles&rdquo;, &ldquo;Velosipēdi&rdquo;).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nosaukums</Label>
            <Input
              autoFocus
              placeholder="piem. Datortehnika"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Ikona</Label>
            <div className="grid grid-cols-4 gap-2">
              {PICKER_ICONS.map(({ name, Comp, label: iconLabel }) => {
                const isSelected = iconName === name;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setIconName(name)}
                    title={iconLabel}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border p-3 transition-colors",
                      isSelected
                        ? "border-graphite-900 bg-graphite-900 text-white"
                        : "border-graphite-200 bg-white text-graphite-700 hover:bg-graphite-50"
                    )}
                  >
                    <Comp className="h-5 w-5" strokeWidth={1.75} />
                    <span className="text-[10px]">{iconLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Atcelt
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!label.trim()}
            >
              Pievienot
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
