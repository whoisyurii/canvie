"use client";

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
  Image,
  Palette,
} from "lucide-react";
import { useWhiteboardStore, Tool } from "@/lib/store/useWhiteboardStore";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const tools: Array<{ id: Tool; icon: any; label: string; hotkey: string }> = [
  { id: "select", icon: MousePointer2, label: "Select", hotkey: "V" },
  { id: "pan", icon: Hand, label: "Pan", hotkey: "H" },
  { id: "rectangle", icon: Square, label: "Rectangle", hotkey: "R" },
  { id: "ellipse", icon: Circle, label: "Ellipse", hotkey: "O" },
  { id: "arrow", icon: ArrowRight, label: "Arrow", hotkey: "A" },
  { id: "line", icon: Minus, label: "Line", hotkey: "L" },
  { id: "text", icon: Type, label: "Text", hotkey: "T" },
  { id: "pen", icon: Pencil, label: "Pen", hotkey: "P" },
  { id: "eraser", icon: Eraser, label: "Eraser", hotkey: "E" },
];

export const TopToolbar = () => {
  const { activeTool, setActiveTool, strokeColor, setStrokeColor } = useWhiteboardStore();

  return (
    <TooltipProvider>
      <div className="floating-panel px-3 py-2 flex items-center gap-1">
        {tools.map((tool, index) => (
          <div key={tool.id} className="flex items-center">
            {index > 0 && (index === 2 || index === 6) && (
              <Separator orientation="vertical" className="h-8 mx-1" />
            )}
            <Tooltip>
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
          </div>
        ))}

        <Separator orientation="vertical" className="h-8 mx-1" />

        {/* Color Picker */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="tool-button relative overflow-hidden"
              >
                <Palette className="h-5 w-5" />
                <input
                  type="color"
                  value={strokeColor}
                  onChange={(e) => setStrokeColor(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </Button>
              <div
                className="absolute bottom-1 right-1 w-3 h-3 rounded-full border border-white"
                style={{ backgroundColor: strokeColor }}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Stroke Color</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
};
