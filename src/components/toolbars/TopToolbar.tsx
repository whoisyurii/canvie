"use client";

import { useCallback, useState, type ChangeEvent } from "react";
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
} from "lucide-react";
import { nanoid } from "nanoid";
import { useWhiteboardStore, Tool } from "@/lib/store/useWhiteboardStore";
import { generateFilePreview } from "@/lib/files/preview";
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
        className={cn("tool-button", params.activeTool === tool.id && "tool-button-active")}
        onClick={() => params.onSelect(tool.id)}
      >
        <tool.icon className="h-5 w-5" />
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
  const {
    activeTool,
    setActiveTool,
    addElement,
    addFile,
    strokeColor,
    strokeWidth,
    strokeStyle,
    fillColor,
    opacity,
    currentUser,
    bringToFront,
    sendToBack,
    deleteSelection,
    clearCanvas,
    resetView,
    selectedIds,
    elements,
  } = useWhiteboardStore();
  const { toast } = useToast();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const hasSelection = selectedIds.length > 0;
  const hasElements = elements.length > 0;

  const processFile = useCallback(
    async (file: File) => {
      if (typeof window === "undefined") {
        return;
      }

      const fileId = nanoid();
      const fileUrl = URL.createObjectURL(file);
      const thumbnailUrl =
        (await generateFilePreview(file, fileUrl)) ??
        (file.type.startsWith("image/") ? fileUrl : undefined);

      addFile({
        id: fileId,
        name: file.name,
        type: file.type,
        url: fileUrl,
        ownerId: currentUser?.id ?? "local-user",
        ownerName: currentUser?.name ?? "You",
        thumbnailUrl,
      });

      const baseElement = {
        id: fileId,
        x: 240,
        y: 160,
        strokeColor,
        strokeWidth,
        strokeStyle,
        fillColor,
        opacity,
      };

      if (file.type.startsWith("image/")) {
        await new Promise<void>((resolve) => {
          const image = new window.Image();
          image.onload = () => {
            addElement({
              ...baseElement,
              type: "image",
              width: Math.min(image.width, 420),
              height: Math.min(image.height, 420),
              fileUrl,
              fileName: file.name,
            });
            resolve();
          };
          image.onerror = () => resolve();
          image.src = fileUrl;
        });
        return;
      }

      if (file.type === "application/pdf") {
        addElement({
          ...baseElement,
          type: "file",
          width: 220,
          height: 280,
          fileUrl,
          fileName: file.name,
        });
        return;
      }

      if (file.type === "text/plain") {
        await new Promise<void>((resolve) => {
          const reader = new FileReader();
          reader.onload = (evt) => {
            const text = evt.target?.result as string;
            addElement({
              ...baseElement,
              type: "text",
              text: text.slice(0, 200),
              fileName: file.name,
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
      fillColor,
      opacity,
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

  return (
    <TooltipProvider>
      <div className="floating-panel top-toolbar">
        <div className="toolbar-section">
          {renderToolButton(TOOL_DEFINITIONS.select, {
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
          {renderToolButton(TOOL_DEFINITIONS.pan, {
            activeTool,
            onSelect: setActiveTool,
          })}
          {renderToolButton(TOOL_DEFINITIONS.line, {
            activeTool,
            onSelect: setActiveTool,
          })}
        </div>

        <Separator orientation="vertical" className="toolbar-separator" />

        <div className="toolbar-section">
          {renderToolButton(TOOL_DEFINITIONS.pen, {
            activeTool,
            onSelect: setActiveTool,
          })}
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
                    <ImagePlus className="h-5 w-5" />
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

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="tool-button">
                  <MoreHorizontal className="h-5 w-5" />
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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TooltipProvider>
  );
};
