"use client";

import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface SidebarSectionProps {
  title: ReactNode;
  disabled?: boolean;
  children: ReactNode;
}

export const SidebarSection = ({ title, disabled, children }: SidebarSectionProps) => {
  return (
    <div
      className={cn("space-y-1.5", disabled && "opacity-40 pointer-events-none")}
      aria-disabled={disabled}
    >
      <Label className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-sidebar-foreground/80">
        {title}
      </Label>
      {children}
    </div>
  );
};
