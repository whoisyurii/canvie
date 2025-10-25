"use client";

import { useMemo, useState } from "react";
import { Share2 } from "lucide-react";

import { useWhiteboardStore, type User } from "@/lib/store/useWhiteboardStore";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const getInitials = (name: string) => {
  const cleaned = name.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (!cleaned) {
    return "??";
  }
  const parts = cleaned.split(" ");
  const initials = parts.slice(0, 2).map((part) => part[0] ?? "").join("");
  return initials.toUpperCase();
};

const renderParticipant = (
  user: User,
  options: { isLocal: boolean },
) => {
  const statusLabel = options.isLocal
    ? "You're here"
    : user.isConnected
      ? "Active now"
      : "Recently active";
  const secondary = user.tool ? `Using ${user.tool}` : statusLabel;

  return (
    <div
      key={user.id}
      className="group flex items-center gap-2.5 rounded-xl border border-transparent px-2 py-1.5 transition-colors hover:border-sidebar-border hover:bg-sidebar-accent/60"
    >
      <div
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white shadow-sm"
        style={{ backgroundColor: user.color }}
        title={user.name}
      >
        {getInitials(user.name)}
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3">
          <span
            className={cn(
              "absolute inset-0 rounded-full",
              user.isConnected ? "animate-ping bg-emerald-400/60" : "hidden",
            )}
          />
          <span
            className={cn(
              "relative block h-3 w-3 rounded-full border-2 border-background",
              user.isConnected ? "bg-emerald-400" : "bg-muted-foreground",
            )}
          />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-sidebar-foreground">
          {options.isLocal ? `${user.name} (You)` : user.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">{secondary}</p>
      </div>
    </div>
  );
};

export const CollaborationControls = () => {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copyInviteStatus, setCopyInviteStatus] = useState<"idle" | "copied" | "error">("idle");
  const [copyRoomStatus, setCopyRoomStatus] = useState<"idle" | "copied" | "error">("idle");

  const {
    users,
    currentUser,
    roomId,
    shareUrl,
  } = useWhiteboardStore();

  const participantCards = useMemo(() => {
    const entries: { user: User; isLocal: boolean }[] = [];
    if (currentUser) {
      entries.push({ user: currentUser, isLocal: true });
    }
    const seen = new Set(currentUser ? [currentUser.id] : []);
    users.forEach((user) => {
      if (!seen.has(user.id)) {
        entries.push({ user, isLocal: false });
        seen.add(user.id);
      }
    });
    return entries;
  }, [currentUser, users]);

  const inviteUrl = useMemo(() => {
    if (shareUrl) {
      return shareUrl;
    }

    if (typeof window !== "undefined") {
      if (roomId) {
        return `${window.location.origin}/r/${roomId}`;
      }
      return window.location.href;
    }

    return roomId ? `/r/${roomId}` : "";
  }, [roomId, shareUrl]);

  const handleInviteOpenChange = (open: boolean) => {
    setInviteOpen(open);
    if (!open) {
      setCopyInviteStatus("idle");
      setCopyRoomStatus("idle");
    }
  };

  const handleCopyInvite = async () => {
    if (!inviteUrl) {
      return;
    }

    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setCopyInviteStatus("error");
      setTimeout(() => setCopyInviteStatus("idle"), 2000);
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopyInviteStatus("copied");
      setTimeout(() => setCopyInviteStatus("idle"), 2000);
    } catch (error) {
      setCopyInviteStatus("error");
      setTimeout(() => setCopyInviteStatus("idle"), 2000);
    }
  };

  const handleCopyRoom = async () => {
    if (!roomId) {
      return;
    }

    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setCopyRoomStatus("error");
      setTimeout(() => setCopyRoomStatus("idle"), 2000);
      return;
    }

    try {
      await navigator.clipboard.writeText(roomId);
      setCopyRoomStatus("copied");
      setTimeout(() => setCopyRoomStatus("idle"), 2000);
    } catch (error) {
      setCopyRoomStatus("error");
      setTimeout(() => setCopyRoomStatus("idle"), 2000);
    }
  };

  const copyButtonLabel =
    copyInviteStatus === "copied"
      ? "Copied!"
      : copyInviteStatus === "error"
        ? "Try again"
        : "Copy link";

  const copyRoomButtonLabel =
    copyRoomStatus === "copied"
      ? "Copied!"
      : copyRoomStatus === "error"
        ? "Try again"
        : "Copy code";

  const copyButtonClassName = "shrink-0 min-w-[96px] justify-center text-sm font-medium";

  return (
    <div className="toolbar-section">
      <Popover open={inviteOpen} onOpenChange={handleInviteOpenChange}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn("tool-button", inviteOpen && "tool-button-active")}
                aria-label="Invite collaborators"
              >
                <Share2 className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Invite collaborators</p>
          </TooltipContent>
        </Tooltip>
        <PopoverContent align="center" className="floating-panel w-[280px] p-0">
          <div className="flex flex-col">
            <div className="border-b border-sidebar-border px-3 py-2">
              <h3 className="text-sm font-semibold text-sidebar-foreground">Invite collaborators</h3>
              <p className="text-xs text-muted-foreground">
                Share this board and work together in real time.
              </p>
            </div>
            <div className="space-y-3 px-3 py-2">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Send this invite link to teammates.</p>
                <div className="flex items-center gap-1">
                  <code className="flex h-7 min-w-0 flex-1 items-center truncate rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2 text-xs font-mono text-sidebar-foreground">
                    {inviteUrl || "Generating invite link..."}
                  </code>
                  <Button
                    size="sm"
                    variant="secondary"
                    className={copyButtonClassName}
                    onClick={handleCopyInvite}
                    disabled={!inviteUrl}
                  >
                    {copyButtonLabel}
                  </Button>
                </div>
              </div>
              {roomId ? (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Prefer to share a room code instead?</p>
                  <div className="flex items-center gap-1">
                    <code className="flex h-7 min-w-0 flex-1 items-center truncate rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2 text-xs font-mono text-sidebar-foreground">
                      {roomId}
                    </code>
                    <Button
                      size="sm"
                      variant="secondary"
                      className={copyButtonClassName}
                      onClick={handleCopyRoom}
                    >
                      {copyRoomButtonLabel}
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="space-y-1">
                <div className="border-t border-sidebar-border pt-2.5">
                  <h4 className="text-sm font-semibold text-sidebar-foreground">Participants</h4>
                </div>
                <ScrollArea className="h-auto max-h-[240px]">
                  <div className="space-y-2 py-1.5">
                    {participantCards.map(({ user, isLocal }) => renderParticipant(user, { isLocal }))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

