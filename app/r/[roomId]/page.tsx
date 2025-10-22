import Link from "next/link";

import { RoomPageClient } from "./RoomPageClient";
import { getRoomValidationMessage, validateRoomId } from "@/lib/collaboration/room";

interface RoomPageProps {
  params: {
    roomId?: string | string[];
  };
}

export const runtime = "edge";

export default function RoomPage({ params }: RoomPageProps) {
  const rawRoomId = params?.roomId;
  const isArrayParam = Array.isArray(rawRoomId);
  const validatedRoomId = !isArrayParam ? validateRoomId(rawRoomId ?? null) : null;
  const validationError = isArrayParam ? "Invalid room ID" : getRoomValidationMessage(rawRoomId ?? null);

  if (!validatedRoomId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[hsl(var(--bg-board))]">
        <p className="text-lg text-foreground">{validationError ?? "Invalid room ID"}</p>
        <Link href="/" className="text-accent underline">
          Return to home
        </Link>
      </div>
    );
  }

  return <RoomPageClient roomId={validatedRoomId} />;
}
