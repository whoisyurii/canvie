"use client";

import { SidebarSection } from "./SidebarSection";
import { cn } from "@/lib/utils";

interface PenBackgroundSelectorProps {
  colors: string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  title?: string;
}

const transparentPattern =
  "linear-gradient(45deg, rgba(255,255,255,0.6) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.6) 75%), linear-gradient(45deg, rgba(255,255,255,0.6) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.6) 75%)";

export const PenBackgroundSelector = ({
  colors,
  value,
  onChange,
  disabled,
  title,
}: PenBackgroundSelectorProps) => {
  const isTransparent = value === "transparent";
  const sectionTitle = title ?? "Stroke Background";

  return (
    <SidebarSection title={sectionTitle} disabled={disabled}>
      <div className="grid grid-cols-6 gap-1.5">
        <button
          type="button"
          aria-pressed={isTransparent}
          aria-label="No stroke background"
          disabled={disabled}
          className={cn(
            "group flex flex-col items-center gap-1 text-[11px] font-medium transition",
            disabled && "cursor-not-allowed opacity-70"
          )}
          onClick={() => onChange("transparent")}
        >
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full border transition-transform",
              isTransparent
                ? "border-accent ring-2 ring-accent/60"
                : "border-sidebar-border group-hover:scale-105",
              disabled && "group-hover:scale-100"
            )}
            style={{
              backgroundImage: transparentPattern,
              backgroundSize: "10px 10px",
              backgroundPosition: "0 0,5px 5px",
            }}
          />
          <span>None</span>
        </button>
        {colors.map((color) => {
          const isActive = value === color;
          return (
            <button
              key={color}
              type="button"
              aria-pressed={isActive}
              aria-label={`Set stroke background to ${color}`}
              disabled={disabled}
              className={cn(
                "group flex flex-col items-center transition",
                disabled && "cursor-not-allowed opacity-70"
              )}
              onClick={() => onChange(color)}
            >
              <span
                className={cn(
                  "h-8 w-8 rounded-full border transition-transform",
                  isActive
                    ? "border-accent ring-2 ring-accent/60"
                    : "border-sidebar-border group-hover:scale-105",
                  disabled && "group-hover:scale-100"
                )}
                style={{ backgroundColor: color }}
              />
              <span className="sr-only">{color}</span>
            </button>
          );
        })}
      </div>
    </SidebarSection>
  );
};
