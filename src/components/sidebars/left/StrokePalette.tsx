"use client";

import { SidebarSection } from "./SidebarSection";
import { cn } from "@/lib/utils";

interface StrokePaletteProps {
  colors: string[];
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}

export const StrokePalette = ({ colors, value, onChange, disabled }: StrokePaletteProps) => {
  return (
    <SidebarSection title="Stroke" disabled={disabled}>
      <div className="grid grid-cols-6 gap-2">
        {colors.map((color) => {
          const isActive = value === color;
          return (
            <button
              key={color}
              type="button"
              aria-pressed={isActive}
              disabled={disabled}
              className={cn(
                "h-8 w-8 rounded-full border transition-transform",
                isActive
                  ? "border-accent ring-2 ring-accent/60"
                  : "border-sidebar-border hover:scale-105",
                disabled && "cursor-not-allowed hover:scale-100"
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
