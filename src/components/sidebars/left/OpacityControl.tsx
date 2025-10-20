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
    <SidebarSection
      title={
        <>
          <span className="normal-case">Opacity</span>
          <span className="normal-case text-[11px] font-medium text-muted-foreground">
            {displayOpacity}%
          </span>
        </>
      }
      disabled={disabled}
    >
      <Slider
        color="hsl(var(--sidebar-accent))"
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
