"use client";

import { useCallback, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  MousePointer2,
  Hand,
  Square,
  Circle,
  ArrowRight,
  Minus,
  Type,
  Pencil,
  Eraser,
  ImagePlus,
  Diamond,
  MoreHorizontal,
  ArrowUp,
  ArrowDown,
  Trash2,
  Focus,
  Sparkles,
  Ruler,
  LogOut,
} from "lucide-react";
import { nanoid } from "nanoid";
import { useWhiteboardStore, Tool } from "@/lib/store/useWhiteboardStore";
import { generateFilePreview } from "@/lib/files/preview";
import { hashFile, storeFile, type FileMetadata } from "@/lib/files/storage";
import type { FileSyncManager } from "@/lib/collaboration/fileSync";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAiSettings } from "@/hooks/useAiSettings";
import { GeminiSettingsDialog } from "@/components/ai/GeminiSettingsDialog";
import { GeminiWorkspace } from "@/components/ai/GeminiWorkspace";
import { CollaborationControls } from "./CollaborationControls";

type ToolbarTool = {
  id: Tool;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hotkey: string;
};

const TOOL_DEFINITIONS: Record<Tool, ToolbarTool> = {
  select: { id: "select", icon: MousePointer2, label: "Select", hotkey: "V" },
  pan: { id: "pan", icon: Hand, label: "Pan", hotkey: "H" },
  pen: { id: "pen", icon: Pencil, label: "Pen", hotkey: "P" },
  eraser: { id: "eraser", icon: Eraser, label: "Eraser", hotkey: "E" },
  text: { id: "text", icon: Type, label: "Text", hotkey: "T" },
  rectangle: { id: "rectangle", icon: Square, label: "Rectangle", hotkey: "R" },
  diamond: { id: "diamond", icon: Diamond, label: "Diamond", hotkey: "D" },
  ellipse: { id: "ellipse", icon: Circle, label: "Ellipse", hotkey: "O" },
  line: { id: "line", icon: Minus, label: "Line", hotkey: "L" },
  arrow: { id: "arrow", icon: ArrowRight, label: "Arrow", hotkey: "A" },
  ruler: { id: "ruler", icon: Ruler, label: "Ruler", hotkey: "M" },
};

const TOOL_DESCRIPTIONS: Record<Tool, string> = {
  select: "Click elements to select and drag them into place.",
  pan: "Hold and drag anywhere on the canvas to move your view.",
  rectangle: "Click and drag to draw rectangles with rounded corners.",
  diamond: "Click and drag to draw diamonds for flow diagrams.",
  ellipse: "Click and drag to draw ellipses and circles.",
  arrow: "Click and drag from the start point to draw an arrow.",
  line: "Click and drag from the start point to draw a straight line.",
  text: "Click on the canvas and start typing to add text.",
  pen: "Click and drag freely to sketch with the pen tool.",
  eraser: "Click on items to remove them from the canvas.",
  ruler: "Measure distances by clicking and dragging across the canvas. Press Shift to show measurements.",
};

const renderToolButton = (
  tool: ToolbarTool,
  params: { activeTool: Tool; onSelect: (tool: Tool) => void },
) => (
  <Tooltip key={tool.id}>
    <TooltipTrigger asChild>
      <Button
        variant="ghost"
        size="icon"
        aria-pressed={params.activeTool === tool.id}
        className={cn("tool-button", params.activeTool === tool.id && "tool-button-active")}
        onClick={() => params.onSelect(tool.id)}
      >
        <tool.icon className="h-4 w-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      <p>
        {tool.label} <kbd className="ml-2 text-xs">({tool.hotkey})</kbd>
      </p>
    </TooltipContent>
  </Tooltip>
);

export const TopToolbar = () => {
  const router = useRouter();
  const {
    activeTool,
    setActiveTool,
    addElement,
    addFile,
    strokeColor,
    strokeOpacity,
    strokeWidth,
    strokeStyle,
    fillColor,
    fillOpacity,
    opacity,
    currentUser,
    bringToFront,
    sendToBack,
    deleteSelection,
    clearCanvas,
    resetView,
    selectedIds,
    elements,
    collaboration,
  } = useWhiteboardStore();
  const { toast } = useToast();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isGeminiWorkspaceOpen, setIsGeminiWorkspaceOpen] = useState(false);
  const [isGeminiSettingsOpen, setIsGeminiSettingsOpen] = useState(false);
  const [isLeaveRoomDialogOpen, setIsLeaveRoomDialogOpen] = useState(false);
  const { geminiApiKey } = useAiSettings();
  const hasGeminiKey = Boolean(geminiApiKey);
  const hasSelection = selectedIds.length > 0;
  const hasElements = elements.length > 0;
  const fileSyncManager = collaboration?.fileSyncManager as FileSyncManager | null;

  const processFile = useCallback(
    async (file: File) => {
      if (typeof window === "undefined") {
        return;
      }

      const fileId = nanoid();
      const fileType = file.type || "";
      const fileName = file.name || "Untitled";

      const fileHash = await hashFile(file);
      const metadata: FileMetadata = {
        name: fileName,
        type: fileType,
        size: file.size,
        ownerId: currentUser?.id ?? "local-user",
        ownerName: currentUser?.name ?? "You",
      };

      await storeFile(fileId, file, metadata, fileHash);
      if (fileSyncManager?.notifyLocalFileAdded) {
        await fileSyncManager.notifyLocalFileAdded(fileId);
      }

      const tempUrl = URL.createObjectURL(file);
      let urlRevoked = false;
      const revokeTempUrl = () => {
        if (!urlRevoked) {
          URL.revokeObjectURL(tempUrl);
          urlRevoked = true;
        }
      };

      const generatedThumbnail = await generateFilePreview(file, tempUrl);
      const thumbnailUrl =
        generatedThumbnail ?? (fileType.startsWith("image/") ? undefined : undefined);

      addFile({
        id: fileId,
        name: fileName,
        type: fileType,
        url: fileId,
        ownerId: metadata.ownerId,
        ownerName: metadata.ownerName,
        thumbnailUrl,
      });

      const baseElement = {
        id: fileId,
        x: 240,
        y: 160,
        strokeColor,
        strokeOpacity,
        strokeWidth,
        strokeStyle,
        fillColor,
        fillOpacity,
        opacity,
      };

      if (fileType.startsWith("image/")) {
        await new Promise<void>((resolve) => {
          const image = new window.Image();
          image.onload = () => {
            const maxDimension = 400;
            const scale = Math.min(
              1,
              maxDimension / Math.max(image.width, image.height),
            );
            addElement({
              ...baseElement,
              type: "image",
              width: Math.max(1, Math.round(image.width * scale)),
              height: Math.max(1, Math.round(image.height * scale)),
              fileUrl: fileId,
              fileName,
              fileType,
            });
            revokeTempUrl();
            resolve();
          };
          image.onerror = () => {
            revokeTempUrl();
            resolve();
          };
          image.src = tempUrl;
        });
        return;
      }

      revokeTempUrl();

      if (fileType === "application/pdf") {
        const addPdfElement = (width: number, height: number) => {
          addElement({
            ...baseElement,
            type: "file",
            width,
            height,
            fileUrl: fileId,
            fileName,
            fileType,
            pdfPage: 1,
            thumbnailUrl,
          });
        };

        if (thumbnailUrl) {
          await new Promise<void>((resolve) => {
            const previewImage = new window.Image();
            previewImage.onload = () => {
              const maxDimension = 240;
              const scale = Math.min(
                1,
                maxDimension / Math.max(previewImage.width, previewImage.height),
              );
              addPdfElement(
                Math.max(120, previewImage.width * scale),
                Math.max(160, previewImage.height * scale),
              );
              resolve();
            };
            previewImage.onerror = () => {
              addPdfElement(200, 260);
              resolve();
            };
            previewImage.src = thumbnailUrl;
          });
        } else {
          addPdfElement(200, 260);
        }
        return;
      }

      if (fileType === "text/plain") {
        await new Promise<void>((resolve) => {
          const reader = new FileReader();
          reader.onload = (evt) => {
            const text = (evt.target?.result as string) ?? "";
            addElement({
              ...baseElement,
              type: "text",
              text: text.slice(0, 200),
              fileName,
            });
            resolve();
          };
          reader.onerror = () => resolve();
          reader.readAsText(file);
        });
      }
    },
    [
      addElement,
      addFile,
      currentUser?.id,
      currentUser?.name,
      fileSyncManager,
      fillColor,
      fillOpacity,
      opacity,
      strokeOpacity,
      strokeColor,
      strokeStyle,
      strokeWidth,
    ]
  );

  const handleFileSelection = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files?.length) {
        return;
      }

      await Promise.all(Array.from(files).map((file) => processFile(file)));

      toast({
        title: "Files uploaded",
        description: `${files.length} file${files.length > 1 ? "s" : ""} added to the board`,
      });

      setIsUploadOpen(false);
      event.target.value = "";
      setActiveTool("select");
    },
    [processFile, setActiveTool, toast]
  );

  const handleClearCanvas = useCallback(() => {
    if (!hasElements) {
      return;
    }

    const confirmed =
      typeof window === "undefined" ? true : window.confirm("Clear the entire canvas?");
    if (!confirmed) {
      return;
    }

    clearCanvas();
    toast({
      title: "Canvas cleared",
      description: "All elements have been removed from the board.",
    });
  }, [clearCanvas, hasElements, toast]);

  const handleDeleteSelection = useCallback(() => {
    if (!hasSelection) {
      return;
    }

    deleteSelection();
    toast({
      title: "Selection deleted",
      description: "The selected elements were removed.",
    });
  }, [deleteSelection, hasSelection, toast]);

  const handleLeaveRoom = useCallback(() => {
    router.push("/");
  }, [router]);

  const activeToolDescription =
    TOOL_DESCRIPTIONS[activeTool] ?? "Select a tool to see how it works.";

  return (
    <TooltipProvider>
      <div className="top-toolbar-wrapper">
        <div className="floating-panel top-toolbar">
          <div className="toolbar-section">
            {renderToolButton(TOOL_DEFINITIONS.select, {
              activeTool,
              onSelect: setActiveTool,
            })}
          {renderToolButton(TOOL_DEFINITIONS.pan, {
            activeTool,
            onSelect: setActiveTool,
          })}
        </div>

        <Separator orientation="vertical" className="toolbar-separator" />

        <div className="toolbar-section">
          {renderToolButton(TOOL_DEFINITIONS.rectangle, {
            activeTool,
            onSelect: setActiveTool,
          })}
          {renderToolButton(TOOL_DEFINITIONS.diamond, {
            activeTool,
            onSelect: setActiveTool,
          })}
          {renderToolButton(TOOL_DEFINITIONS.ellipse, {
            activeTool,
            onSelect: setActiveTool,
          })}
        </div>

        <Separator orientation="vertical" className="toolbar-separator" />

        <div className="toolbar-section">
          {renderToolButton(TOOL_DEFINITIONS.arrow, {
            activeTool,
            onSelect: setActiveTool,
          })}
          {renderToolButton(TOOL_DEFINITIONS.line, {
            activeTool,
            onSelect: setActiveTool,
          })}
          {renderToolButton(TOOL_DEFINITIONS.ruler, {
            activeTool,
            onSelect: setActiveTool,
          })}
          {renderToolButton(TOOL_DEFINITIONS.pen, {
            activeTool,
            onSelect: setActiveTool,
          })}
        </div>

        <Separator orientation="vertical" className="toolbar-separator" />

        <div className="toolbar-section">
          {renderToolButton(TOOL_DEFINITIONS.text, {
            activeTool,
            onSelect: setActiveTool,
          })}

          <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn("tool-button", isUploadOpen && "tool-button-active")}
                  >
                    <ImagePlus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  Insert Image/PDF <kbd className="ml-2 text-xs">(Shift + I)</kbd>
                </p>
              </TooltipContent>
            </Tooltip>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Insert image or PDF</DialogTitle>
                <DialogDescription>
                  Upload files to place them on the canvas. Drag & drop also works directly on the
                  board.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-2">
                  <Label htmlFor="toolbar-upload" className="text-xs font-medium">
                    Choose files
                  </Label>
                  <Input
                    id="toolbar-upload"
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    onChange={handleFileSelection}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setIsUploadOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Separator orientation="vertical" className="toolbar-separator" />

        <div className="toolbar-section">
          {renderToolButton(TOOL_DEFINITIONS.eraser, {
            activeTool,
            onSelect: setActiveTool,
          })}
        </div>

        <Separator orientation="vertical" className="toolbar-separator" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "tool-button",
                isGeminiWorkspaceOpen && hasGeminiKey && "tool-button-active",
                !hasGeminiKey && "text-amber-500 hover:text-amber-500",
              )}
              onClick={() => {
                if (hasGeminiKey) {
                  setIsGeminiWorkspaceOpen(true);
                } else {
                  setIsGeminiSettingsOpen(true);
                }
              }}
              aria-label={hasGeminiKey ? "Open Gemini workspace" : "Gemini API key required"}
            >
              <Sparkles className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p
              className={cn(
                "text-sm",
                !hasGeminiKey && "font-medium text-amber-500",
              )}
            >
              {hasGeminiKey
                ? "Open Gemini workspace"
                : "Add a Gemini API key to unlock AI tools"}
            </p>
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="toolbar-separator" />

        <CollaborationControls />

        <Separator orientation="vertical" className="toolbar-separator" />

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="tool-button">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>Canvas actions</p>
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                bringToFront();
              }}
              disabled={!hasSelection}
            >
              <ArrowUp className="mr-2 h-4 w-4" /> Bring to front
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                sendToBack();
              }}
              disabled={!hasSelection}
            >
              <ArrowDown className="mr-2 h-4 w-4" /> Send to back
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                handleDeleteSelection();
              }}
              disabled={!hasSelection}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete selection
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                resetView();
              }}
            >
              <Focus className="mr-2 h-4 w-4" /> Reset view
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                handleClearCanvas();
              }}
              disabled={!hasElements}
              className={cn(
                "text-destructive focus:text-destructive",
                !hasElements && "text-muted-foreground focus:text-muted-foreground"
              )}
            >
              <Trash2
                className={cn(
                  "mr-2 h-4 w-4",
                  hasElements ? "text-destructive" : "text-muted-foreground"
                )}
              />
              Clear canvas
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setIsLeaveRoomDialogOpen(true);
              }}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4 text-destructive" /> Leave room
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <GeminiWorkspace
          open={isGeminiWorkspaceOpen}
          onOpenChange={setIsGeminiWorkspaceOpen}
          onOpenSettings={() => setIsGeminiSettingsOpen(true)}
        />
        <GeminiSettingsDialog open={isGeminiSettingsOpen} onOpenChange={setIsGeminiSettingsOpen} />
        <AlertDialog open={isLeaveRoomDialogOpen} onOpenChange={setIsLeaveRoomDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave this room?</AlertDialogTitle>
              <AlertDialogDescription>
                You'll exit the current collaboration session. You can rejoin later if you
                return to this room.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setIsLeaveRoomDialogOpen(false)}>
                Stay in room
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  setIsLeaveRoomDialogOpen(false);
                  handleLeaveRoom();
                }}
              >
                Leave room
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </div>
        <p className="top-toolbar-helper" role="status" aria-live="polite">
          {activeToolDescription}
        </p>
      </div>
    </TooltipProvider>
  );
};
