"use client";

import type { ReactNode } from "react";
import { SidebarSection } from "./SidebarSection";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TextAlignment } from "@/lib/store/useWhiteboardStore";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface TextFormattingControlsProps {
  fontFamily: string;
  onFontFamilyChange: (font: string) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  alignment: TextAlignment;
  onAlignmentChange: (alignment: TextAlignment) => void;
  disabled?: boolean;
}

const FONT_OPTIONS: Array<{ label: string; value: string; preview: string }> = [
  { label: "Inter", value: "Inter", preview: '"Inter", sans-serif' },
  { label: "DM Sans", value: "DM Sans", preview: '"DM Sans", sans-serif' },
  { label: "Roboto Mono", value: "Roboto Mono", preview: '"Roboto Mono", monospace' },
];

const ALIGN_OPTIONS: Array<{ value: TextAlignment; icon: ReactNode; label: string }> = [
  { value: "left", icon: <AlignLeft className="h-4 w-4" />, label: "Left" },
  { value: "center", icon: <AlignCenter className="h-4 w-4" />, label: "Center" },
  { value: "right", icon: <AlignRight className="h-4 w-4" />, label: "Right" },
];

export const TextFormattingControls = ({
  fontFamily,
  onFontFamilyChange,
  fontSize,
  onFontSizeChange,
  alignment,
  onAlignmentChange,
  disabled,
}: TextFormattingControlsProps) => {
  return (
    <SidebarSection title="Text" disabled={disabled}>
      <div className="space-y-4">
        <div className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/80">Font</span>
          <Select
            value={fontFamily}
            onValueChange={(value) => onFontFamilyChange(value)}
            disabled={disabled}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Choose a font" />
            </SelectTrigger>
            <SelectContent>
              {FONT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <span style={{ fontFamily: option.preview }}>{option.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-medium text-sidebar-foreground/80">
            <span>Size</span>
            <span>{Math.round(fontSize)}</span>
          </div>
          <Slider
            value={[fontSize]}
            min={12}
            max={48}
            step={1}
            disabled={disabled}
            onValueChange={([next]) => onFontSizeChange(next ?? fontSize)}
          />
        </div>

        <div className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/80">Alignment</span>
          <ToggleGroup
            type="single"
            value={alignment}
            onValueChange={(next) => next && onAlignmentChange(next as TextAlignment)}
            className="grid grid-cols-3 gap-2"
          >
            {ALIGN_OPTIONS.map((option) => (
              <ToggleGroupItem
                key={option.value}
                value={option.value}
                className={cn(
                  "group h-10 rounded-md border border-sidebar-border bg-sidebar/60 text-sidebar-foreground/80 transition",
                  "data-[state=on]:border-accent data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm",
                  disabled && "cursor-not-allowed opacity-70"
                )}
                disabled={disabled}
              >
                <div className="flex flex-col items-center justify-center gap-1 text-[11px]">
                  {option.icon}
                  <span className="font-medium">{option.label}</span>
                </div>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>
    </SidebarSection>
  );
};
