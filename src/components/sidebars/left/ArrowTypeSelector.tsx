"use client";

import type { ReactNode } from "react";
import { ArrowBigLeft, ArrowBigRight, ArrowLeftRight, Minus, CurlyLoop, Slash } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SidebarSection } from "./SidebarSection";
import { ArrowStyle, ArrowType } from "@/lib/store/useWhiteboardStore";
import { cn } from "@/lib/utils";

interface ArrowTypeSelectorProps {
  type: ArrowType;
  onTypeChange: (value: ArrowType) => void;
  style: ArrowStyle;
  onStyleChange: (value: ArrowStyle) => void;
  disabled?: boolean;
}

const TYPE_OPTIONS: Array<{ value: ArrowType; label: string; icon: ReactNode }> = [
  { value: "line", label: "None", icon: <Minus className="h-4 w-4" /> },
  { value: "arrow-start", label: "Start", icon: <ArrowBigLeft className="h-4 w-4" /> },
  { value: "arrow-end", label: "End", icon: <ArrowBigRight className="h-4 w-4" /> },
  { value: "arrow-both", label: "Both", icon: <ArrowLeftRight className="h-4 w-4" /> },
];

const STYLE_OPTIONS: Array<{ value: ArrowStyle; label: string; icon: ReactNode }> = [
  { value: "straight", label: "Straight", icon: <Slash className="h-4 w-4 -rotate-12" /> },
  { value: "curve", label: "Curved", icon: <CurlyLoop className="h-4 w-4" /> },
];

export const ArrowTypeSelector = ({
  type,
  onTypeChange,
  style,
  onStyleChange,
  disabled,
}: ArrowTypeSelectorProps) => {
  return (
    <SidebarSection title="Arrow" disabled={disabled}>
      <div className="space-y-3">
        <ToggleGroup
          type="single"
          value={type}
          onValueChange={(next) => next && onTypeChange(next as ArrowType)}
          className="grid grid-cols-4 gap-2"
        >
          {TYPE_OPTIONS.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              aria-label={`${option.label} arrowhead`}
              className={cn(
                "h-12 rounded-md border border-sidebar-border bg-sidebar/60 transition",
                "data-[state=on]:border-accent data-[state=on]:bg-background data-[state=on]:shadow-sm",
                disabled && "cursor-not-allowed opacity-70"
              )}
              disabled={disabled}
            >
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-[11px]">
                {option.icon}
                <span>{option.label}</span>
              </div>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <ToggleGroup
          type="single"
          value={style}
          onValueChange={(next) => next && onStyleChange(next as ArrowStyle)}
          className="grid grid-cols-2 gap-2"
        >
          {STYLE_OPTIONS.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              aria-label={`${option.label} arrow`}
              className={cn(
                "h-12 rounded-md border border-sidebar-border bg-sidebar/60 transition",
                "data-[state=on]:border-accent data-[state=on]:bg-background data-[state=on]:shadow-sm",
                disabled && "cursor-not-allowed opacity-70"
              )}
              disabled={disabled}
            >
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-[11px]">
                {option.icon}
                <span>{option.label}</span>
              </div>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </SidebarSection>
  );
};
