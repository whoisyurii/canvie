"use client";

import { SidebarSection } from "./SidebarSection";
import { Slider } from "@/components/ui/slider";

interface OpacityControlProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export const OpacityControl = ({ value, onChange, disabled }: OpacityControlProps) => {
  return (
    <SidebarSection title={`Opacity ${Math.round(value * 100)}%`} disabled={disabled}>
      <Slider
        value={[value * 100]}
        onValueChange={([next]) => onChange(next / 100)}
        min={0}
        max={100}
        step={1}
        disabled={disabled}
      />
    </SidebarSection>
  );
};
