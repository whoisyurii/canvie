"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
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
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDragDrop } from "@/components/canvas/DragDropHandler";
import { useWhiteboardStore, type SharedFile } from "@/lib/store/useWhiteboardStore";
import { cn } from "@/lib/utils";
import {
  ExternalLink,
  FileText,
  ImagePlus,
  MoreVertical,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";
import Image from "next/image";

const renderFileRow = (
  file: SharedFile,
  params: {
    canManage: boolean;
    onFocus: () => void;
    onOpen: () => void;
    onRename: () => void;
    onRemove: () => void;
  },
) => {
  const isPdf = file.type === "application/pdf";
  const fileTypeLabel = file.type ? file.type.split("/").pop() ?? file.type : "File";

  return (
    <div
      key={file.id}
      role="button"
      tabIndex={0}
      onClick={params.onFocus}
      onDoubleClick={() => {
        if (isPdf) {
          params.onOpen();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          params.onFocus();
        }
      }}
      className="group flex cursor-pointer items-center gap-2.5 rounded-xl border border-transparent px-2 py-1.5 transition-colors hover:border-sidebar-border hover:bg-sidebar-accent/60 focus:outline-none"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sidebar-accent/50">
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
          <FileText className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-sidebar-foreground">{file.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {fileTypeLabel.toUpperCase()} · Uploaded by {params.canManage ? "you" : file.ownerName}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {isPdf ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground"
                aria-label="Open PDF preview"
                onClick={(event) => {
                  event.stopPropagation();
                  params.onOpen();
                }}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Open PDF preview</TooltipContent>
          </Tooltip>
        ) : null}
        {params.canManage ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground"
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
    </div>
  );
};

export const SharedFilesPopover = () => {
  const [filesOpen, setFilesOpen] = useState(false);
  const [renamingFile, setRenamingFile] = useState<SharedFile | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingDelete, setPendingDelete] = useState<SharedFile | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { handleFileInput } = useDragDrop();

  const {
    uploadedFiles,
    currentUser,
    focusElement,
    renameFile,
    removeFile,
    openFilePreview,
  } = useWhiteboardStore();

  const handleFilePickerChange = (event: ChangeEvent<HTMLInputElement>) => {
    void handleFileInput(event);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

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

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf,text/plain"
        multiple
        className="hidden"
        onChange={handleFilePickerChange}
      />
      <Popover open={filesOpen} onOpenChange={setFilesOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn("tool-button", filesOpen && "tool-button-active")}
                aria-label="Insert or manage files"
              >
                <ImagePlus className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Insert or manage files</p>
          </TooltipContent>
        </Tooltip>
        <PopoverContent align="center" className="floating-panel w-[280px] p-0">
          <div className="flex flex-col">
            <div className="space-y-2 border-b border-sidebar-border px-3 py-2">
              <h3 className="text-sm font-semibold text-sidebar-foreground">Shared files</h3>
              <p className="text-xs text-muted-foreground">Access uploads dropped onto the canvas.</p>
              <Button
                variant="secondary"
                size="sm"
                className="w-full justify-center"
                onClick={() => {
                  setFilesOpen(false);
                  handleUploadClick();
                }}
              >
                <Upload className="mr-2 h-4 w-4" /> Upload files
              </Button>
            </div>
            {uploadedFiles.length === 0 ? (
              <div className="flex h-[200px] flex-col items-center justify-center gap-2 px-3 py-3 text-center">
                <FileText className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-sidebar-foreground">No files yet</p>
                  <p className="text-xs text-muted-foreground">
                    Drop images, PDFs, or text files onto the canvas to share them here.
                  </p>
                </div>
              </div>
            ) : (
              <ScrollArea className="h-[230px]">
                <div className="space-y-2 px-3 py-2">
                  <p className="text-xs text-muted-foreground">
                    Double-click a PDF on the canvas or use Open to preview it.
                  </p>
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
                      onOpen: () => {
                        openFilePreview(file.id, {
                          name: file.name,
                          type: file.type,
                          ownerId: file.ownerId,
                          ownerName: file.ownerName,
                          sourceElementId: file.id,
                          thumbnailUrl: file.thumbnailUrl,
                        });
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
              <Label htmlFor="shared-file-name">File name</Label>
              <Input
                id="shared-file-name"
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
    </>
  );
};

