"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SidebarSection } from "./SidebarSection";
import { Sloppiness } from "@/lib/store/useWhiteboardStore";
import { cn } from "@/lib/utils";

interface SloppinessSelectorProps {
  value: Sloppiness;
  onChange: (value: Sloppiness) => void;
  disabled?: boolean;
}

const OPTIONS: { value: Sloppiness; label: string; path: string }[] = [
  { value: "smooth", label: "Smooth", path: "M2 10 Q 10 2 18 10 Q 26 18 34 10 Q 42 2 50 10" },
  { value: "normal", label: "Natural", path: "M2 10 Q 8 4 14 10 Q 20 16 26 10 Q 32 4 38 10 Q 44 16 50 10" },
  { value: "rough", label: "Rough", path: "M2 10 L 8 4 L 14 12 L 20 6 L 26 14 L 32 6 L 38 12 L 44 4 L 50 10" },
];

export const SloppinessSelector = ({ value, onChange, disabled }: SloppinessSelectorProps) => {
  return (
    <SidebarSection title="Sloppiness" disabled={disabled}>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(next) => next && onChange(next as Sloppiness)}
        className="grid grid-cols-3 gap-2"
      >
        {OPTIONS.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            aria-label={`${option.label} stroke`}
            className={cn(
              "h-16 rounded-md border border-sidebar-border bg-sidebar/60 px-2 py-2 transition",
              "data-[state=on]:border-accent data-[state=on]:bg-background data-[state=on]:shadow-sm",
              disabled && "cursor-not-allowed opacity-70"
            )}
            disabled={disabled}
          >
            <div className="flex h-full w-full flex-col items-center justify-center gap-2">
              <svg viewBox="0 0 52 20" className="h-5 w-full fill-none stroke-current">
                <path d={option.path} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[11px] font-medium text-muted-foreground">{option.label}</span>
            </div>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </SidebarSection>
  );
};
