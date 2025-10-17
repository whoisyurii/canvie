"use client";

import { Button } from "@/components/ui/button";
import { SidebarSection } from "./SidebarSection";
import { ChevronsUpDown, ChevronsDownUp } from "lucide-react";

interface LayerActionsProps {
  disabled?: boolean;
  onBringToFront: () => void;
  onSendToBack: () => void;
}

export const LayerActions = ({ disabled, onBringToFront, onSendToBack }: LayerActionsProps) => {
  return (
    <SidebarSection title="Layers" disabled={disabled}>
      <div className="grid grid-cols-2 gap-0.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-foreground hover:text-foreground"
          disabled={disabled}
          onClick={onBringToFront}
        >
          <ChevronsUpDown className="mr-2 h-4 w-4" />
          Front
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-foreground hover:text-foreground"
          disabled={disabled}
          onClick={onSendToBack}
        >
          <ChevronsDownUp className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>
    </SidebarSection>
  );
};
