"use client";

import { Button } from "@/components/ui/button";
import { SidebarSection } from "./SidebarSection";

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
      <div className="grid grid-cols-4 gap-1">
        {widths.map((width) => (
          <Button
            key={width}
            type="button"
            variant={value === width ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs"
            disabled={disabled}
            onClick={() => onChange(width)}
          >
            {width}px
          </Button>
        ))}
      </div>
    </SidebarSection>
  );
};
