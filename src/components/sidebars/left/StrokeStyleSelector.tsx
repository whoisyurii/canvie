"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SidebarSection } from "./SidebarSection";
import { StrokeStyle } from "@/lib/store/useWhiteboardStore";
import { cn } from "@/lib/utils";

interface StrokeStyleSelectorProps {
  value: StrokeStyle;
  onChange: (value: StrokeStyle) => void;
  disabled?: boolean;
}

const styles: { value: StrokeStyle; label: string; dash?: number[] }[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed", dash: [10, 6] },
  { value: "dotted", label: "Dotted", dash: [2, 6] },
];

export const StrokeStyleSelector = ({ value, onChange, disabled }: StrokeStyleSelectorProps) => {
  return (
    <SidebarSection title="Stroke Style" disabled={disabled}>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(next) => next && onChange(next as StrokeStyle)}
        className="grid grid-cols-3 gap-2"
      >
        {styles.map((style) => (
          <ToggleGroupItem
            key={style.value}
            value={style.value}
            aria-label={`${style.label} stroke`}
            className={cn(
              "h-14 rounded-md border border-sidebar-border bg-sidebar/60 px-2 py-2 transition",
              "data-[state=on]:border-accent data-[state=on]:bg-background data-[state=on]:shadow-sm",
              disabled && "cursor-not-allowed opacity-70"
            )}
            disabled={disabled}
          >
            <div className="flex h-full w-full flex-col items-center justify-center gap-1">
              <svg viewBox="0 0 48 12" className="h-3 w-full fill-none stroke-current">
                <line
                  x1="4"
                  y1="6"
                  x2="44"
                  y2="6"
                  strokeWidth={2.5}
                  strokeDasharray={style.dash?.join(" ")}
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-[11px] font-medium text-muted-foreground">{style.label}</span>
            </div>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </SidebarSection>
  );
};
