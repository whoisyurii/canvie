"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  Users,
  FileText,
  ChevronRight,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  useWhiteboardStore,
  type SharedFile,
  type User,
} from "@/lib/store/useWhiteboardStore";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import Image from "next/image";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
      className="group flex items-center gap-3 rounded-xl border border-transparent px-2 py-2 transition-colors hover:border-sidebar-border hover:bg-sidebar-accent/60"
    >
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white shadow-sm"
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
        <p className="truncate text-sm font-medium text-sidebar-foreground">
          {file.name}
        </p>
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

export const RightSidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<"participants" | "files">("participants");
  const [renamingFile, setRenamingFile] = useState<SharedFile | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingDelete, setPendingDelete] = useState<SharedFile | null>(null);

  const {
    users,
    uploadedFiles,
    currentUser,
    focusElement,
    renameFile,
    removeFile,
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

  const collapsedRail = (
    <div className="floating-panel flex w-16 flex-col items-center gap-3 py-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "tool-button h-10 w-10",
              activeTab === "participants" && "tool-button-active",
            )}
            onClick={() => {
              setActiveTab("participants");
              setIsCollapsed(false);
            }}
          >
            <Users className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Participants</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "tool-button h-10 w-10",
              activeTab === "files" && "tool-button-active",
            )}
            onClick={() => {
              setActiveTab("files");
              setIsCollapsed(false);
            }}
          >
            <FileText className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Files</TooltipContent>
      </Tooltip>
    </div>
  );

  const expandedPanel = (
    <div
      className="floating-panel flex w-[320px] flex-col"
      style={{ height: "min(720px, calc(100vh - 5rem))" }}
    >
      <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3">
        <h3 className="text-sm font-semibold text-sidebar-foreground">Collaboration</h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          onClick={() => setIsCollapsed(true)}
        >
          <ChevronRight className="h-4 w-4 rotate-180" />
        </Button>
      </div>

      <div className="flex flex-1 flex-col">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as "participants" | "files")}
          className="flex flex-1 flex-col"
        >
          <TabsList className="grid w-full grid-cols-2 bg-sidebar-accent text-xs">
            <TabsTrigger value="participants" className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              Participants
            </TabsTrigger>
            <TabsTrigger value="files" className="flex items-center gap-1">
              <FileText className="h-4 w-4" />
              Files
            </TabsTrigger>
          </TabsList>

          <TabsContent value="participants" className="mt-0 flex-1 px-0 py-0">
            <ScrollArea className="h-full">
              <div className="space-y-3 px-4 py-3">
                {participantCards.map(({ user, isLocal }) => renderParticipant(user, { isLocal }))}
                {!users.length ? (
                  <p className="rounded-xl border border-dashed border-sidebar-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
                    Invite teammates to collaborate in real time.
                  </p>
                ) : null}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="files" className="mt-0 flex-1 px-0 py-0">
            <ScrollArea className="h-full">
              {uploadedFiles.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-3 text-center">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-sidebar-foreground">No files yet</p>
                    <p className="text-xs text-muted-foreground">
                      Drop images, PDFs, or text files onto the canvas to share them here.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 px-4 py-3">
                  {uploadedFiles.map((file) => {
                    const canManage = currentUser?.id
                      ? file.ownerId === currentUser.id
                      : file.ownerId === "local-user";
                    return renderFileRow(file, {
                      canManage,
                      onFocus: () => focusElement(file.id),
                      onRename: () => {
                        setRenamingFile(file);
                        setRenameValue(file.name);
                      },
                      onRemove: () => setPendingDelete(file),
                    });
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );

  return (
    <TooltipProvider>
      <div id="right-sidebar-root" className="relative">
        <div className={cn(isCollapsed ? "hidden" : "block")}>{expandedPanel}</div>
        <div className={cn(isCollapsed ? "block" : "hidden")}>{collapsedRail}</div>
      </div>

      <Dialog open={Boolean(renamingFile)} onOpenChange={(open) => !open && setRenamingFile(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename file</DialogTitle>
            <DialogDescription>
              Update the name shown in the collaboration sidebar and on the canvas.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRenameSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="file-name">File name</Label>
              <Input
                id="file-name"
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

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this file?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? `This will remove ${pendingDelete.name} from the canvas for everyone.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove file
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
};
