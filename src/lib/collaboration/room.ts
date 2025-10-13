const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const validateRoomId = (roomId: string | null | undefined): string | null => {
  if (!roomId) {
    return null;
  }

  const trimmed = roomId.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (!ROOM_ID_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed;
};

export const getRoomValidationMessage = (roomId: string | null | undefined): string | null => {
  if (!roomId || roomId.trim().length === 0) {
    return "Room ID is required.";
  }

  const trimmed = roomId.trim();
  if (trimmed.length > 64) {
    return "Room ID must be 64 characters or fewer.";
  }

  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return "Room ID can only contain letters, numbers, underscores, and hyphens.";
  }

  return null;
};

export type CollaborationTransport = "webrtc";

export const resolveCollaborationTransport = (): CollaborationTransport => {
  const configured = (process.env.NEXT_PUBLIC_COLLAB_TRANSPORT ?? "webrtc").toLowerCase();
  if (configured !== "webrtc") {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `[Collaboration] Unsupported transport "${configured}" requested; falling back to WebRTC.`,
      );
    }
    return "webrtc";
  }
  return "webrtc";
};
