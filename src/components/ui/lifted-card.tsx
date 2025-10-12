"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const liftedCardVariants = cva(
  "group relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 p-6 text-slate-100 shadow-[0_18px_45px_-15px_rgba(15,23,42,0.85)] backdrop-blur-md transition-shadow duration-300 before:absolute before:inset-x-0 before:-top-px before:h-px before:bg-gradient-to-b before:from-white/80 before:via-white/20 before:to-transparent before:content-[''] after:pointer-events-none after:absolute after:inset-0 after:rounded-2xl after:border after:border-white/5",
  {
    variants: {
      tone: {
        slate: "bg-slate-950/60 text-slate-100",
        zinc: "bg-zinc-950/60 text-zinc-100",
        stone: "bg-stone-950/60 text-stone-100",
        neutral: "bg-neutral-950/60 text-neutral-100",
      },
    },
    defaultVariants: {
      tone: "slate",
    },
  },
);

type LiftedCardProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof liftedCardVariants>;

const LiftedCard = React.forwardRef<HTMLDivElement, LiftedCardProps>(
  ({ className, tone, children, ...props }, ref) => (
    <div ref={ref} className={cn(liftedCardVariants({ tone }), className)} {...props}>
      <div className="relative z-10 space-y-3">
        {children}
      </div>
    </div>
  ),
);
LiftedCard.displayName = "LiftedCard";

export { LiftedCard, liftedCardVariants };
