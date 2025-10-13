"use client";

import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  Users,
  FileText,
  MoreVertical,
  Pencil,
  Trash2,
  Share2,
  Upload,
} from "lucide-react";

import {
  useWhiteboardStore,
  type SharedFile,
  type User,
} from "@/lib/store/useWhiteboardStore";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useDragDrop } from "@/components/canvas/DragDropHandler";

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
      className="group flex items-center gap-3 rounded-xl border border-transparent px-2 py-2 transition-colors hover:border-sidebar-border hover:bg-sidebar-accent/60"
    >
      <div
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white shadow-sm"
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

const renderFileRow = (
  file: SharedFile,
  params: {
    canManage: boolean;
    onFocus: () => void;
    onRename: () => void;
    onRemove: () => void;
  },
) => {
  const fileTypeLabel = file.type ? file.type.split("/").pop() ?? file.type : "File";
  return (
    <div
      key={file.id}
      role="button"
      tabIndex={0}
      onClick={params.onFocus}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          params.onFocus();
        }
      }}
      className="group flex cursor-pointer items-center gap-3 rounded-xl border border-transparent px-2 py-2 transition-colors hover:border-sidebar-border hover:bg-sidebar-accent/60 focus:outline-none"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sidebar-accent/50">
        {file.thumbnailUrl ? (
          <Image
            src={file.thumbnailUrl}
            alt="File preview"
            width={96}
            height={96}
            className="h-full w-full object-cover"
            unoptimized
          />
        ) : (
          <FileText className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-sidebar-foreground">{file.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {fileTypeLabel.toUpperCase()} · Uploaded by {params.canManage ? "you" : file.ownerName}
        </p>
      </div>
      {params.canManage ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              onClick={(event) => event.stopPropagation()}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                params.onRename();
              }}
            >
              <Pencil className="mr-2 h-4 w-4" /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={(event) => {
                event.preventDefault();
                params.onRemove();
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
};

export const CollaborationControls = () => {
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [renamingFile, setRenamingFile] = useState<SharedFile | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingDelete, setPendingDelete] = useState<SharedFile | null>(null);
  const [copyInviteStatus, setCopyInviteStatus] = useState<"idle" | "copied" | "error">("idle");
  const [copyRoomStatus, setCopyRoomStatus] = useState<"idle" | "copied" | "error">("idle");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { handleFileInput } = useDragDrop();

  const {
    users,
    uploadedFiles,
    currentUser,
    focusElement,
    renameFile,
    removeFile,
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

  const handleRenameSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (renamingFile) {
      const trimmed = renameValue.trim();
      if (!trimmed) {
        return;
      }
      renameFile(renamingFile.id, trimmed);
      setRenamingFile(null);
    }
  };

  const handleDeleteConfirm = () => {
    if (pendingDelete) {
      removeFile(pendingDelete.id);
      setPendingDelete(null);
    }
  };

  const handleParticipantsOpenChange = (open: boolean) => {
    setParticipantsOpen(open);
    if (open) {
      setFilesOpen(false);
      setInviteOpen(false);
    }
  };

  const handleFilesOpenChange = (open: boolean) => {
    setFilesOpen(open);
    if (open) {
      setParticipantsOpen(false);
      setInviteOpen(false);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFilePickerChange = (event: ChangeEvent<HTMLInputElement>) => {
    void handleFileInput(event);
  };

  const handleInviteOpenChange = (open: boolean) => {
    setInviteOpen(open);
    if (open) {
      setParticipantsOpen(false);
      setFilesOpen(false);
    } else {
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

  return (
    <div className="toolbar-section">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf,text/plain"
        multiple
        className="hidden"
        onChange={handleFilePickerChange}
      />
      <Popover open={participantsOpen} onOpenChange={handleParticipantsOpenChange}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn("tool-button", participantsOpen && "tool-button-active")}
                aria-label="View participants"
              >
                <Users className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Participants</p>
          </TooltipContent>
        </Tooltip>
        <PopoverContent align="center" className="floating-panel w-[320px] p-0">
          <div className="flex flex-col">
            <div className="border-b border-sidebar-border px-4 py-3">
              <h3 className="text-sm font-semibold text-sidebar-foreground">Participants</h3>
              <p className="text-xs text-muted-foreground">See who&apos;s collaborating right now.</p>
            </div>
            <ScrollArea className="h-[280px]">
              <div className="space-y-3 px-4 py-3">
                {participantCards.map(({ user, isLocal }) => renderParticipant(user, { isLocal }))}
                {!users.length ? (
                  <p className="rounded-xl border border-dashed border-sidebar-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
                    Use the invite button to share this board and collaborate in real time.
                  </p>
                ) : null}
              </div>
            </ScrollArea>
          </div>
        </PopoverContent>
      </Popover>

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
                <Share2 className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Invite collaborators</p>
          </TooltipContent>
        </Tooltip>
        <PopoverContent align="center" className="floating-panel w-[360px] p-0">
          <div className="flex flex-col">
            <div className="border-b border-sidebar-border px-4 py-3">
              <h3 className="text-sm font-semibold text-sidebar-foreground">Invite collaborators</h3>
              <p className="text-xs text-muted-foreground">
                Share this board and work together in real time.
              </p>
            </div>
            <div className="space-y-4 px-4 py-3">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Send this invite link to teammates.</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-xs font-mono text-sidebar-foreground">
                    {inviteUrl || "Generating invite link..."}
                  </code>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shrink-0"
                    onClick={handleCopyInvite}
                    disabled={!inviteUrl}
                  >
                    {copyButtonLabel}
                  </Button>
                </div>
              </div>
              {roomId ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Prefer to share a room code instead?</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-xs font-mono text-sidebar-foreground">
                      {roomId}
                    </code>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="shrink-0"
                      onClick={handleCopyRoom}
                    >
                      {copyRoomButtonLabel}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Popover open={filesOpen} onOpenChange={handleFilesOpenChange}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn("tool-button", filesOpen && "tool-button-active")}
                aria-label="View shared files"
              >
                <FileText className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Shared files</p>
          </TooltipContent>
        </Tooltip>
        <PopoverContent align="center" className="floating-panel w-[360px] p-0">
          <div className="flex flex-col">
            <div className="space-y-3 border-b border-sidebar-border px-4 py-3">
              <h3 className="text-sm font-semibold text-sidebar-foreground">Shared files</h3>
              <p className="text-xs text-muted-foreground">Access uploads dropped onto the canvas.</p>
              <Button
                variant="secondary"
                size="sm"
                className="w-full justify-center"
                onClick={handleUploadClick}
              >
                <Upload className="mr-2 h-4 w-4" /> Upload files
              </Button>
            </div>
            {uploadedFiles.length === 0 ? (
              <div className="flex h-[240px] flex-col items-center justify-center gap-2 px-4 py-4 text-center">
                <FileText className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-sidebar-foreground">No files yet</p>
                  <p className="text-xs text-muted-foreground">
                    Drop images, PDFs, or text files onto the canvas to share them here.
                  </p>
                </div>
              </div>
            ) : (
              <ScrollArea className="h-[280px]">
                <div className="space-y-3 px-4 py-3">
                  {uploadedFiles.map((file) => {
                    const canManage = currentUser?.id
                      ? file.ownerId === currentUser.id
                      : file.ownerId === "local-user";
                    return renderFileRow(file, {
                      canManage,
                      onFocus: () => {
                        focusElement(file.id);
                        setFilesOpen(false);
                      },
                      onRename: () => {
                        setRenamingFile(file);
                        setRenameValue(file.name);
                        setFilesOpen(false);
                      },
                      onRemove: () => {
                        setPendingDelete(file);
                        setFilesOpen(false);
                      },
                    });
                  })}
                </div>
              </ScrollArea>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={Boolean(renamingFile)} onOpenChange={(open) => !open && setRenamingFile(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename file</DialogTitle>
            <DialogDescription>
              Update the name shown in the collaboration menu and on the canvas.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRenameSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="collab-file-name">File name</Label>
              <Input
                id="collab-file-name"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setRenamingFile(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!renameValue.trim()}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this file?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? `This will remove ${pendingDelete.name} from the canvas for everyone.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove file
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

