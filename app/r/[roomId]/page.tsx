import Link from "next/link";

import { RoomPageClient } from "./RoomPageClient";
import { getRoomValidationMessage, validateRoomId } from "@/lib/collaboration/room";

export const runtime = "edge";

interface RoomPageParams {
  roomId?: string | string[];
}

interface RoomPageProps {
  params: Promise<RoomPageParams>;
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { roomId: rawRoomId } = await params;
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
