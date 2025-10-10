"use client";

import { useCallback, useMemo, useState, type ChangeEvent } from "react";
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
  Shapes,
  ImagePlus,
  Diamond,
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
  DropdownMenuLabel,
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

type ToolbarTool = {
  id: Tool;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hotkey: string;
};

const primaryTools: ToolbarTool[] = [
  { id: "select", icon: MousePointer2, label: "Select", hotkey: "V" },
  { id: "pan", icon: Hand, label: "Pan", hotkey: "H" },
  { id: "pen", icon: Pencil, label: "Pen", hotkey: "P" },
  { id: "eraser", icon: Eraser, label: "Eraser", hotkey: "E" },
  { id: "text", icon: Type, label: "Text", hotkey: "T" },
];

const shapeTools: ToolbarTool[] = [
  { id: "rectangle", icon: Square, label: "Rectangle", hotkey: "R" },
  { id: "diamond", icon: Diamond, label: "Diamond", hotkey: "D" },
  { id: "ellipse", icon: Circle, label: "Ellipse", hotkey: "O" },
  { id: "line", icon: Minus, label: "Line", hotkey: "L" },
  { id: "arrow", icon: ArrowRight, label: "Arrow", hotkey: "A" },
];

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
  } = useWhiteboardStore();
  const { toast } = useToast();
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const isShapeActive = useMemo(
    () => shapeTools.some((tool) => tool.id === activeTool),
    [activeTool]
  );

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

  return (
    <TooltipProvider>
      <div className="floating-panel px-4 py-2 flex items-center gap-2">
        {primaryTools.map((tool) => (
          <Tooltip key={tool.id}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`tool-button ${activeTool === tool.id ? "tool-button-active" : ""}`}
                onClick={() => setActiveTool(tool.id)}
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
        ))}

        <Separator orientation="vertical" className="h-8" />

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`tool-button ${isShapeActive ? "tool-button-active" : ""}`}
                >
                  <Shapes className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                Shapes <kbd className="ml-2 text-xs">(Shift + S)</kbd>
              </p>
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="center" className="w-48">
            <DropdownMenuLabel className="text-xs uppercase text-muted-foreground">
              Shape Tools
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {shapeTools.map((tool) => (
              <DropdownMenuItem
                key={tool.id}
                onSelect={(e) => {
                  e.preventDefault();
                  setActiveTool(tool.id);
                }}
                className={`flex items-center gap-2 text-sm ${
                  activeTool === tool.id ? "text-accent" : ""
                }`}
              >
                <tool.icon className="h-4 w-4" />
                <span className="flex-1">{tool.label}</span>
                <kbd className="text-[10px] text-muted-foreground">{tool.hotkey}</kbd>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="h-8" />

        <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`tool-button ${isUploadOpen ? "tool-button-active" : ""}`}
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
    </TooltipProvider>
  );
};
