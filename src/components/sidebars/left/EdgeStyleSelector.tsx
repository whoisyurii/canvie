"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SidebarSection } from "./SidebarSection";
import { CornerStyle } from "@/lib/store/useWhiteboardStore";
import { cn } from "@/lib/utils";

interface EdgeStyleSelectorProps {
  value: CornerStyle;
  onChange: (value: CornerStyle) => void;
  disabled?: boolean;
}

const EDGE_OPTIONS: Array<{ value: CornerStyle; label: string; radius: number }> = [
  { value: "sharp", label: "Straight", radius: 0 },
  { value: "rounded", label: "Rounded", radius: 12 },
];

export const EdgeStyleSelector = ({ value, onChange, disabled }: EdgeStyleSelectorProps) => {
  return (
    <SidebarSection title="Edges" disabled={disabled}>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(next) => next && onChange(next as CornerStyle)}
        className="grid grid-cols-2 gap-2"
      >
        {EDGE_OPTIONS.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            aria-label={`${option.label} corners`}
            className={cn(
              "group h-16 rounded-md border border-sidebar-border bg-sidebar/60 text-muted-foreground transition",
              "data-[state=on]:border-accent data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm",
              disabled && "cursor-not-allowed opacity-70"
            )}
            disabled={disabled}
          >
            <div className="flex h-full w-full flex-col items-center justify-center gap-2">
              <div className="h-8 w-12 border-2 border-foreground" style={{ borderRadius: option.radius }} />
              <span className="text-[11px] font-medium">{option.label}</span>
            </div>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </SidebarSection>
  );
};
