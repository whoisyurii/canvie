"use client";

import { Button } from "@/components/ui/button";
import { SidebarSection } from "./SidebarSection";
import { Sloppiness } from "@/lib/store/useWhiteboardStore";

interface SloppinessSelectorProps {
  value: Sloppiness;
  onChange: (value: Sloppiness) => void;
  disabled?: boolean;
}

const options: { value: Sloppiness; label: string; description: string }[] = [
  { value: "smooth", label: "Smooth", description: "Clean edges" },
  { value: "normal", label: "Natural", description: "Hand-drawn" },
  { value: "rough", label: "Rough", description: "Wobbly" },
];

export const SloppinessSelector = ({ value, onChange, disabled }: SloppinessSelectorProps) => {
  return (
    <SidebarSection title="Sloppiness" disabled={disabled}>
      <div className="grid grid-cols-3 gap-1">
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={value === option.value ? "default" : "outline"}
            size="sm"
            className="h-14 flex flex-col items-center justify-center gap-1 text-[11px]"
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            <span className="font-medium">{option.label}</span>
            <span className="text-[10px] text-muted-foreground">{option.description}</span>
          </Button>
        ))}
      </div>
    </SidebarSection>
  );
};
