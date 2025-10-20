"use client";

import { SidebarSection } from "./SidebarSection";
import { cn } from "@/lib/utils";

interface FillPaletteProps {
  colors: string[];
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  recentColors?: string[];
}

const transparentPattern =
  "linear-gradient(45deg, rgba(255,255,255,0.65) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.65) 75%), linear-gradient(45deg, rgba(255,255,255,0.65) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.65) 75%)";

export const FillPalette = ({
  colors,
  value,
  onChange,
  disabled,
  recentColors = [],
}: FillPaletteProps) => {
  const isTransparent = value === "transparent";

  return (
    <SidebarSection title="Fill" disabled={disabled}>
      {/* QW-4: Recent Colors Section */}
      {recentColors.length > 0 && (
        <div className="mb-2">
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Recent</div>
          <div className="grid grid-cols-6 gap-1.5">
            {recentColors.map((color) => {
              const isActive = value === color;
              const isRecentTransparent = color === "transparent";
              return (
                <button
                  key={color}
                  type="button"
                  aria-pressed={isActive}
                  disabled={disabled}
                  className={cn(
                    "h-7 w-7 rounded-full border transition-transform",
                    isRecentTransparent && "bg-[length:10px_10px]",
                    isActive
                      ? "border-accent ring-2 ring-accent/60"
                      : "border-sidebar-border hover:scale-105",
                    disabled && "cursor-not-allowed hover:scale-100"
                  )}
                  style={
                    isRecentTransparent
                      ? {
                          backgroundImage: transparentPattern,
                          backgroundPosition: "0 0,5px 5px",
                          backgroundColor: "#f87171",
                        }
                      : { backgroundColor: color }
                  }
                  onClick={() => onChange(color)}
                />
              );
            })}
          </div>
        </div>
      )}
      {/* Main Color Palette */}
      <div className="grid grid-cols-6 gap-1.5">
        <button
          type="button"
          aria-pressed={isTransparent}
          disabled={disabled}
          className={cn(
            "h-7 w-7 rounded-full border transition-transform bg-[length:10px_10px]",
            isTransparent
              ? "border-accent ring-2 ring-accent/60"
              : "border-sidebar-border hover:scale-105",
            disabled && "cursor-not-allowed hover:scale-100"
          )}
          style={{
            backgroundImage: transparentPattern,
            backgroundPosition: "0 0,5px 5px",
            backgroundColor: "#f87171",
          }}
          onClick={() => onChange("transparent")}
        />
        {colors.map((color) => {
          const isActive = value === color;
          return (
            <button
              key={color}
              type="button"
              aria-pressed={isActive}
              disabled={disabled}
              className={cn(
                "h-7 w-7 rounded-full border transition-transform",
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
