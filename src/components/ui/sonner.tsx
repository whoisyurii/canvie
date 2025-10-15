"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-primary group-[.toaster]:text-primary-foreground group-[.toaster]:border-primary/40 group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-primary-foreground/80",
          actionButton:
            "group-[.toast]:bg-background group-[.toast]:text-primary group-[.toast]:hover:bg-background/90",
          cancelButton:
            "group-[.toast]:bg-primary/80 group-[.toast]:text-primary-foreground group-[.toast]:hover:bg-primary/70",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
