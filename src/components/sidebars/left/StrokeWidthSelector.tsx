"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SidebarSection } from "./SidebarSection";
import { cn } from "@/lib/utils";

interface StrokeWidthSelectorProps {
  widths: number[];
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export const StrokeWidthSelector = ({
  widths,
  value,
  onChange,
  disabled,
}: StrokeWidthSelectorProps) => {
  return (
    <SidebarSection title="Stroke Width" disabled={disabled}>
      <ToggleGroup
        type="single"
        value={String(value)}
        onValueChange={(next) => {
          if (next) {
            onChange(Number(next));
          }
        }}
        className="grid grid-cols-4 gap-2"
      >
        {widths.map((width) => (
          <ToggleGroupItem
            key={width}
            value={String(width)}
            aria-label={`${width}px stroke`}
            className={cn(
              "group h-12 rounded-md border border-sidebar-border bg-sidebar/60 text-sidebar-foreground transition",
              "data-[state=on]:border-accent data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm",
              disabled && "cursor-not-allowed opacity-70"
            )}
            disabled={disabled}
          >
            <div className="flex h-full w-full flex-col items-center justify-center gap-1">
              <div
                className={cn(
                  "w-8 rounded-full bg-sidebar-foreground/80 transition",
                  "group-data-[state=on]:bg-foreground"
                )}
                style={{ height: Math.max(2, width), minHeight: 2 }}
              />
              <span className="text-[11px] font-medium text-sidebar-foreground group-data-[state=on]:text-foreground">
                {width}px
              </span>
            </div>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </SidebarSection>
  );
};
