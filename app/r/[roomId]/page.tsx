"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { BottomBar } from "@/components/toolbars/BottomBar";
import { CollaborationProvider } from "@/components/collaboration/CollaborationProvider";
import { LeftSidebar } from "@/components/sidebars/LeftSidebar";
import { TopToolbar } from "@/components/toolbars/TopToolbar";
import { WhiteboardCanvas } from "@/components/canvas/WhiteboardCanvas";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { getRoomValidationMessage, validateRoomId } from "@/lib/collaboration/room";

export const runtime = "edge";

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const rawRoomId = params?.roomId;
  const isArrayParam = Array.isArray(rawRoomId);
  const roomId = isArrayParam ? null : validateRoomId(rawRoomId ?? null);
  const validationError = isArrayParam ? "Invalid room ID" : getRoomValidationMessage(rawRoomId ?? null);

  useKeyboardShortcuts();

  if (!roomId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[hsl(var(--bg-board))]">
        <p className="text-lg text-foreground">{validationError ?? "Invalid room ID"}</p>
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

        <div className="absolute left-1/2 top-3 z-50 -translate-x-1/2">
          <TopToolbar />
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
