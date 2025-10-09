"use client";

import type { ReactNode } from "react";
import { ArrowBigLeft, ArrowBigRight, ArrowLeftRight, Minus } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SidebarSection } from "./SidebarSection";
import { ArrowType } from "@/lib/store/useWhiteboardStore";

interface ArrowheadControlsProps {
  value: ArrowType;
  onChange: (value: ArrowType) => void;
  disabled?: boolean;
}

const options: Array<{ value: ArrowType; icon: ReactNode; label: string }> = [
  { value: "line", icon: <Minus className="h-4 w-4" />, label: "None" },
  { value: "arrow-start", icon: <ArrowBigLeft className="h-4 w-4" />, label: "Start" },
  { value: "arrow-end", icon: <ArrowBigRight className="h-4 w-4" />, label: "End" },
  { value: "arrow-both", icon: <ArrowLeftRight className="h-4 w-4" />, label: "Both" },
];

export const ArrowheadControls = ({ value, onChange, disabled }: ArrowheadControlsProps) => {
  return (
    <SidebarSection title="Arrowheads" disabled={disabled}>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(next) => next && onChange(next as ArrowType)}
        className="grid grid-cols-4 gap-1"
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            className="h-10 flex flex-col items-center justify-center gap-1 text-[10px]"
          >
            {option.icon}
            <span>{option.label}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </SidebarSection>
  );
};
