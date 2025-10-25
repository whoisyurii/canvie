"use client";

import Link from "next/link";

import { LogOut } from "lucide-react";

import { BottomBar } from "@/components/toolbars/BottomBar";
import { CollaborationProvider } from "@/components/collaboration/CollaborationProvider";
import { LeftSidebar } from "@/components/sidebars/LeftSidebar";
import { TopToolbar } from "@/components/toolbars/TopToolbar";
import { WhiteboardCanvas } from "@/components/canvas/WhiteboardCanvas";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { PdfViewerDialog } from "@/components/files/PdfViewerDialog";
import { Button } from "@/components/ui/button";

interface RoomPageClientProps {
  roomId: string;
}

export function RoomPageClient({ roomId }: RoomPageClientProps) {
  useKeyboardShortcuts();

  if (!roomId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[hsl(var(--bg-board))]">
        <p className="text-lg text-foreground">Invalid room ID</p>
        <Link href="/" className="text-accent underline">
          Return to home
        </Link>
      </div>
    );
  }

  return (
    <CollaborationProvider roomId={roomId}>
      <div className="relative h-screen w-full overflow-x-hidden overflow-y-auto bg-[hsl(var(--bg-board))]">
        <WhiteboardCanvas />
        <PdfViewerDialog />

        <div className="absolute left-1/2 top-3 z-50 -translate-x-1/2">
          <TopToolbar />
        </div>

        <div className="absolute right-3 top-3 z-50">
          <Button
            asChild
            size="icon"
            variant="ghost"
            className="floating-panel top-toolbar h-10 w-10 justify-center hover:bg-sidebar"
          >
            <Link href="/" aria-label="Exit room">
              <LogOut className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="absolute left-3 top-1/2 z-40 -translate-y-1/2">
          <LeftSidebar />
        </div>

        <div className="absolute left-1/2 bottom-3 z-40 -translate-x-1/2">
          <BottomBar />
        </div>
      </div>
    </CollaborationProvider>
  );
}
