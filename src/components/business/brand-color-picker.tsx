"use client";

/**
 * BrandColorPicker — pick a hex color for the company's
 * sidebar accent.
 *
 * Behavior:
 *   - 10 preset swatches in a single row, click to select
 *   - Custom hex input for users who want a specific brand color
 *   - Invalid hex → input stays red-bordered, parent doesn't get
 *     the value until it's valid
 *   - Empty string is valid (means "no preference, use default")
 *
 * Why a controlled component:
 *   The parent (requisites modal, add-company modal) holds the
 *   brandColor in form state alongside other fields. This lets
 *   the parent submit the whole form atomically.
 *
 * Why hex strings instead of named colors:
 *   - User can paste their actual brand hex code from their style
 *     guide (e.g. "#10b981" exactly)
 *   - One format works everywhere: CSS background, opacity-mixed
 *     sidebar tint, JSON storage
 *   - Tailwind-style names ('emerald-500') would need a translation
 *     layer for non-Tailwind contexts
 */

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Curated palette of 10 popular brand colors. Picked for:
 *   - Good contrast against white sidebar text
 *   - Reasonable saturation (not garish, not muted)
 *   - Coverage across the color wheel so any company can find one
 *
 * If you change these, also update the company seed data in any
 * tests / docs that reference specific values.
 */
const PRESET_COLORS = [
  { hex: "#0F172A", name: "Grafīts" },     // slate-900
  { hex: "#DC2626", name: "Sarkans" },     // red-600
  { hex: "#EA580C", name: "Oranžs" },      // orange-600
  { hex: "#CA8A04", name: "Zelta" },       // yellow-600
  { hex: "#16A34A", name: "Zaļš" },        // green-600
  { hex: "#0891B2", name: "Tirkīzs" },     // cyan-600
  { hex: "#2563EB", name: "Zils" },        // blue-600
  { hex: "#7C3AED", name: "Violets" },     // violet-600
  { hex: "#DB2777", name: "Rozā" },        // pink-600
  { hex: "#57534E", name: "Akmens" },      // stone-600
] as const;

const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/;

interface BrandColorPickerProps {
  value: string; // hex like '#10b981' or empty string
  onChange: (hex: string) => void;
  disabled?: boolean;
}

export function BrandColorPicker({
  value,
  onChange,
  disabled,
}: BrandColorPickerProps) {
  // Local input state so the user can type freely without us
  // rejecting partial input ('#10b'). We push to onChange only
  // when the value parses or when they pick a preset.
  const [customInput, setCustomInput] = useState(value);

  const normalizedValue = (value ?? "").toUpperCase();
  const isPreset = PRESET_COLORS.some(
    (c) => c.hex.toUpperCase() === normalizedValue
  );
  const customIsValidish =
    !customInput || HEX_REGEX.test(customInput);

  return (
    <div className="space-y-2">
      {/* Preset swatches */}
      <div className="flex flex-wrap gap-1.5">
        {PRESET_COLORS.map((c) => {
          const selected = normalizedValue === c.hex.toUpperCase();
          return (
            <button
              key={c.hex}
              type="button"
              disabled={disabled}
              onClick={() => {
                onChange(c.hex);
                setCustomInput(c.hex);
              }}
              title={c.name}
              className={cn(
                "relative h-8 w-8 rounded-lg border-2 transition-all",
                "hover:scale-105 active:scale-95",
                selected
                  ? "border-graphite-900 shadow-soft-md"
                  : "border-white shadow-soft-xs hover:border-graphite-200",
                disabled && "opacity-50 cursor-not-allowed"
              )}
              style={{ backgroundColor: c.hex }}
            >
              {selected && (
                <Check
                  className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow-md"
                  strokeWidth={3}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Custom hex input */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-graphite-400 shrink-0">vai</span>
        <div className="relative flex-1">
          <input
            type="text"
            value={customInput}
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value;
              setCustomInput(v);
              // Only push to parent when valid (or cleared)
              if (!v) {
                onChange("");
              } else if (HEX_REGEX.test(v)) {
                onChange(v.toUpperCase());
              }
            }}
            placeholder="#10B981"
            className={cn(
              "w-full rounded-lg border bg-white px-3 py-1.5 pl-8 text-[12.5px] font-mono",
              "focus:outline-none focus:ring-2 focus:ring-graphite-900 focus:border-transparent",
              customIsValidish
                ? "border-graphite-200"
                : "border-red-300 focus:ring-red-500",
              disabled && "bg-graphite-50 text-graphite-400 cursor-not-allowed"
            )}
          />
          {/* Color preview swatch inside the input */}
          {customIsValidish && customInput && (
            <div
              className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded border border-graphite-200"
              style={{ backgroundColor: customInput }}
            />
          )}
        </div>
        {!isPreset && value && customIsValidish && (
          <span className="text-[10.5px] text-graphite-400 shrink-0">
            Pielāgots
          </span>
        )}
      </div>

      {!customIsValidish && (
        <p className="text-[10.5px] text-red-600">
          Ievadi 6-zīmju hex kodu, piem. #10B981
        </p>
      )}
    </div>
  );
}
