"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { BottomBar } from "@/components/toolbars/BottomBar";
import { CollaborationProvider } from "@/components/collaboration/CollaborationProvider";
import { LeftSidebar } from "@/components/sidebars/LeftSidebar";
import { RightSidebar } from "@/components/sidebars/RightSidebar";
import { TopToolbar } from "@/components/toolbars/TopToolbar";
import { WhiteboardCanvas } from "@/components/canvas/WhiteboardCanvas";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

export const runtime = "edge";

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params?.roomId;

  useKeyboardShortcuts();

  if (!roomId || Array.isArray(roomId)) {
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
      <div className="relative h-screen w-full overflow-hidden bg-[hsl(var(--bg-board))]">
        <WhiteboardCanvas />

        <div className="absolute left-1/2 top-4 z-50 -translate-x-1/2">
          <TopToolbar />
        </div>

        <div className="absolute left-4 top-1/2 z-40 -translate-y-1/2">
          <LeftSidebar />
        </div>

        <div className="absolute right-4 top-20 z-40">
          <RightSidebar />
        </div>

        <div className="absolute left-1/2 bottom-4 z-40 -translate-x-1/2">
          <BottomBar />
        </div>
      </div>
    </CollaborationProvider>
  );
}
