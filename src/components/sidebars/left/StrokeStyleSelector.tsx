"use client";

import { Button } from "@/components/ui/button";
import { SidebarSection } from "./SidebarSection";
import { StrokeStyle } from "@/lib/store/useWhiteboardStore";

interface StrokeStyleSelectorProps {
  value: StrokeStyle;
  onChange: (value: StrokeStyle) => void;
  disabled?: boolean;
}

const styles: { value: StrokeStyle; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
];

export const StrokeStyleSelector = ({ value, onChange, disabled }: StrokeStyleSelectorProps) => {
  return (
    <SidebarSection title="Stroke Style" disabled={disabled}>
      <div className="grid grid-cols-3 gap-1">
        {styles.map((style) => (
          <Button
            key={style.value}
            type="button"
            variant={value === style.value ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs"
            disabled={disabled}
            onClick={() => onChange(style.value)}
          >
            {style.label}
          </Button>
        ))}
      </div>
    </SidebarSection>
  );
};
