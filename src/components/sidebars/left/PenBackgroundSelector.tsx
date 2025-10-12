"use client";

import { SidebarSection } from "./SidebarSection";
import { cn } from "@/lib/utils";

interface PenBackgroundSelectorProps {
  colors: string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const transparentPattern =
  "linear-gradient(45deg, rgba(255,255,255,0.6) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.6) 75%), linear-gradient(45deg, rgba(255,255,255,0.6) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.6) 75%)";

export const PenBackgroundSelector = ({
  colors,
  value,
  onChange,
  disabled,
}: PenBackgroundSelectorProps) => {
  const isTransparent = value === "transparent";

  return (
    <SidebarSection title="Pen Background" disabled={disabled}>
      <div className="grid grid-cols-6 gap-2">
        <button
          type="button"
          aria-pressed={isTransparent}
          disabled={disabled}
          className={cn(
            "flex h-12 flex-col items-center justify-center rounded-md border text-[11px] font-medium transition",
            isTransparent
              ? "border-accent bg-background text-foreground shadow-sm"
              : "border-sidebar-border bg-sidebar/60 text-sidebar-foreground/80 hover:scale-105",
            disabled && "cursor-not-allowed opacity-70 hover:scale-100"
          )}
          style={{
            backgroundImage: transparentPattern,
            backgroundSize: "10px 10px",
            backgroundPosition: "0 0,5px 5px",
          }}
          onClick={() => onChange("transparent")}
        >
          None
        </button>
        {colors.map((color) => {
          const isActive = value === color;
          return (
            <button
              key={color}
              type="button"
              aria-pressed={isActive}
              disabled={disabled}
              className={cn(
                "h-12 rounded-md border transition",
                isActive
                  ? "border-accent bg-background shadow-sm"
                  : "border-sidebar-border hover:scale-105",
                disabled && "cursor-not-allowed opacity-70 hover:scale-100"
              )}
              style={{ backgroundColor: color }}
              onClick={() => onChange(color)}
            />
          );
        })}
      </div>
    </SidebarSection>
  );
};
