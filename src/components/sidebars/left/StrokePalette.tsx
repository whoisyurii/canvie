"use client";

import { SidebarSection } from "./SidebarSection";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

interface StrokePaletteProps {
  colors: string[];
  value: string;
  onChange: (color: string) => void;
  opacity: number;
  onOpacityChange: (opacity: number) => void;
  disabled?: boolean;
  recentColors?: string[];
}

export const StrokePalette = ({
  colors,
  value,
  onChange,
  opacity,
  onOpacityChange,
  disabled,
  recentColors = [],
}: StrokePaletteProps) => {
  const displayOpacity = Math.round(opacity * 100);

  return (
    <SidebarSection title="Stroke" disabled={disabled}>
      {/* QW-4: Recent Colors Section */}
      {recentColors.length > 0 && (
        <div className="mb-2">
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Recent</div>
          <div className="grid grid-cols-6 gap-1.5">
            {recentColors.map((color) => {
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
        </div>
      )}
      {/* Main Color Palette */}
      <div className="grid grid-cols-6 gap-1.5">
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
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>Opacity</span>
          <span>{displayOpacity}%</span>
        </div>
        <Slider
          color={value}
          value={[opacity * 100]}
          onValueChange={([next]) => onOpacityChange(next / 100)}
          min={0}
          max={100}
          step={1}
          disabled={disabled}
        />
      </div>
    </SidebarSection>
  );
};
