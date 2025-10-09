import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Realitea Canvas",
  description: "Collaborate in real time on an infinite whiteboard canvas.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={cn("min-h-screen bg-background text-foreground antialiased")}> 
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
