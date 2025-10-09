"use client";

import { useWhiteboardStore } from "@/lib/store/useWhiteboardStore";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, ChevronsDownUp } from "lucide-react";

const colorPresets = [
  "#000000",
  "#e03131",
  "#2f9e44",
  "#1971c2",
  "#f59f00",
  "#ae3ec9",
  "#ffffff",
];

const strokeWidths = [1, 2, 4, 8];

export const LeftSidebar = () => {
  const {
    strokeColor,
    setStrokeColor,
    strokeWidth,
    setStrokeWidth,
    strokeStyle,
    setStrokeStyle,
    opacity,
    setOpacity,
    fillColor,
    setFillColor,
  } = useWhiteboardStore();

  return (
    <div className="floating-panel p-4 space-y-4 max-w-[240px]">
      <h3 className="text-sm font-semibold text-sidebar-foreground">Tool Settings</h3>

      {/* Stroke Color */}
      <div className="space-y-2">
        <Label className="text-xs text-sidebar-foreground">Stroke Color</Label>
        <div className="grid grid-cols-7 gap-1">
          {colorPresets.map((color) => (
            <button
              key={color}
              className={`w-7 h-7 rounded border-2 transition-all ${
                strokeColor === color
                  ? "border-accent scale-110"
                  : "border-sidebar-border hover:scale-105"
              }`}
              style={{ backgroundColor: color }}
              onClick={() => setStrokeColor(color)}
            />
          ))}
        </div>
      </div>

      {/* Fill Color */}
      <div className="space-y-2">
        <Label className="text-xs text-sidebar-foreground">Fill Color</Label>
        <div className="grid grid-cols-7 gap-1">
          <button
            className={`w-7 h-7 rounded border-2 transition-all ${
              fillColor === "transparent"
                ? "border-accent scale-110"
                : "border-sidebar-border hover:scale-105"
            }`}
            style={{
              background:
                "linear-gradient(45deg, transparent 48%, #e03131 48%, #e03131 52%, transparent 52%)",
            }}
            onClick={() => setFillColor("transparent")}
          />
          {colorPresets.slice(0, 6).map((color) => (
            <button
              key={color}
              className={`w-7 h-7 rounded border-2 transition-all ${
                fillColor === color
                  ? "border-accent scale-110"
                  : "border-sidebar-border hover:scale-105"
              }`}
              style={{ backgroundColor: color }}
              onClick={() => setFillColor(color)}
            />
          ))}
        </div>
      </div>

      {/* Stroke Width */}
      <div className="space-y-2">
        <Label className="text-xs text-sidebar-foreground">Stroke Width</Label>
        <div className="grid grid-cols-4 gap-1">
          {strokeWidths.map((width) => (
            <Button
              key={width}
              variant={strokeWidth === width ? "default" : "outline"}
              size="sm"
              className="h-8"
              onClick={() => setStrokeWidth(width)}
            >
              {width}px
            </Button>
          ))}
        </div>
      </div>

      {/* Stroke Style */}
      <div className="space-y-2">
        <Label className="text-xs text-sidebar-foreground">Stroke Style</Label>
        <div className="grid grid-cols-3 gap-1">
          {(["solid", "dashed", "dotted"] as const).map((style) => (
            <Button
              key={style}
              variant={strokeStyle === style ? "default" : "outline"}
              size="sm"
              className="h-8 capitalize"
              onClick={() => setStrokeStyle(style)}
            >
              {style}
            </Button>
          ))}
        </div>
      </div>

      {/* Opacity */}
      <div className="space-y-2">
        <Label className="text-xs text-sidebar-foreground">
          Opacity: {Math.round(opacity * 100)}%
        </Label>
        <Slider
          value={[opacity * 100]}
          onValueChange={([value]) => setOpacity(value / 100)}
          min={0}
          max={100}
          step={1}
          className="w-full"
        />
      </div>

      {/* Layer Controls */}
      <div className="space-y-2 pt-2 border-t border-sidebar-border">
        <Label className="text-xs text-sidebar-foreground">Layer Controls</Label>
        <div className="grid grid-cols-2 gap-1">
          <Button variant="outline" size="sm" className="h-8">
            <ChevronsUpDown className="h-4 w-4 mr-1" />
            Front
          </Button>
          <Button variant="outline" size="sm" className="h-8">
            <ChevronsDownUp className="h-4 w-4 mr-1" />
            Back
          </Button>
        </div>
      </div>
    </div>
  );
};
