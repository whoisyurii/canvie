"use client";

import { SidebarSection } from "./SidebarSection";
import { Slider } from "@/components/ui/slider";

interface OpacityControlProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export const OpacityControl = ({ value, onChange, disabled }: OpacityControlProps) => {
  const displayOpacity = Math.round(value * 100);

  return (
    <SidebarSection title={<span className="sr-only">Opacity</span>} disabled={disabled}>
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs font-medium text-sidebar-foreground/80">
          <span>Opacity</span>
          <span>{displayOpacity}%</span>
        </div>
        <Slider
          value={[value * 100]}
          onValueChange={([next]) => onChange(next / 100)}
          min={0}
          max={100}
          step={1}
          disabled={disabled}
        />
      </div>
    </SidebarSection>
  );
};
