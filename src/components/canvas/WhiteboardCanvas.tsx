"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { Stage, Layer, Rect, Circle, Line, Text as KonvaText, Arrow, Image as KonvaImage, Group } from "react-konva";
import { useWhiteboardStore } from "@/lib/store/useWhiteboardStore";
import type { CanvasElement } from "@/lib/store/useWhiteboardStore";
import { nanoid } from "nanoid";
import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useDragDrop } from "./DragDropHandler";
import { UserCursor } from "./UserCursor";
import { cn } from "@/lib/utils";

type HighlightProps = Record<string, unknown> | undefined;

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

const normalizeRectBounds = (
  x: number,
  y: number,
  width = 0,
  height = 0,
): Bounds => {
  const minX = width >= 0 ? x : x + width;
  const minY = height >= 0 ? y : y + height;
  const maxX = width >= 0 ? x + width : x;
  const maxY = height >= 0 ? y + height : y;
  return { minX, minY, maxX, maxY };
};

const getElementBounds = (element: CanvasElement): Bounds => {
  switch (element.type) {
    case "rectangle":
    case "ellipse":
    case "image":
    case "file": {
      return normalizeRectBounds(element.x, element.y, element.width ?? 0, element.height ?? 0);
    }
    case "line":
    case "arrow": {
      if (element.points && element.points.length >= 2) {
        let minX = element.x;
        let minY = element.y;
        let maxX = element.x;
        let maxY = element.y;
        for (let index = 0; index < element.points.length; index += 2) {
          const px = element.x + (element.points[index] ?? 0);
          const py = element.y + (element.points[index + 1] ?? 0);
          minX = Math.min(minX, px);
          minY = Math.min(minY, py);
          maxX = Math.max(maxX, px);
          maxY = Math.max(maxY, py);
        }
        return { minX, minY, maxX, maxY };
      }
      return { minX: element.x, minY: element.y, maxX: element.x, maxY: element.y };
    }
    case "pen": {
      if (element.points && element.points.length >= 2) {
        let minX = element.x;
        let minY = element.y;
        let maxX = element.x;
        let maxY = element.y;
        for (let index = 0; index < element.points.length; index += 2) {
          const px = element.x + (element.points[index] ?? 0);
          const py = element.y + (element.points[index + 1] ?? 0);
          minX = Math.min(minX, px);
          minY = Math.min(minY, py);
          maxX = Math.max(maxX, px);
          maxY = Math.max(maxY, py);
        }
        return { minX, minY, maxX, maxY };
      }
      return { minX: element.x, minY: element.y, maxX: element.x, maxY: element.y };
    }
    case "text": {
      const approxWidth = Math.max(120, Math.min((element.text?.length ?? 0) * 10, 320));
      const approxHeight = 32;
      return normalizeRectBounds(element.x, element.y, approxWidth, approxHeight);
    }
    default:
      return { minX: element.x, minY: element.y, maxX: element.x, maxY: element.y };
  }
};

const duplicateElement = (element: CanvasElement): CanvasElement => ({
  ...element,
  id: nanoid(),
  points: element.points ? [...element.points] : undefined,
  selected: false,
});

const ImageElement = ({
  element,
  highlight,
}: {
  element: CanvasElement;
  highlight?: HighlightProps;
}) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!element.fileUrl) return;

    const img = new window.Image();
    img.src = element.fileUrl;
    img.onload = () => setImage(img);

    return () => {
      img.onload = null;
    };
  }, [element.fileUrl]);

  return image ? (
    <KonvaImage
      id={element.id}
      image={image}
      x={element.x}
      y={element.y}
      width={element.width}
      height={element.height}
      opacity={element.opacity}
      rotation={element.rotation}
      {...highlight}
    />
  ) : null;
};

const FileElement = ({
  element,
  highlight,
}: {
  element: CanvasElement;
  highlight?: HighlightProps;
}) => {
  const [thumbnail, setThumbnail] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!element.thumbnailUrl) {
      setThumbnail(null);
      return;
    }

    const img = new window.Image();
    img.src = element.thumbnailUrl;
    img.onload = () => setThumbnail(img);

    return () => {
      img.onload = null;
    };
  }, [element.thumbnailUrl]);

  const width = element.width ?? 200;
  const height = element.height ?? 240;
  const padding = 12;
  const previewHeight = Math.max(0, height - padding * 2 - 32);

  return (
    <Group>
      <Rect
        id={element.id}
        x={element.x}
        y={element.y}
        width={width}
        height={height}
        stroke={element.strokeColor}
        strokeWidth={element.strokeWidth}
        fill="white"
        opacity={element.opacity}
        cornerRadius={8}
        {...highlight}
      />
      {thumbnail ? (
        <KonvaImage
          id={element.id}
          image={thumbnail}
          x={element.x + padding}
          y={element.y + padding}
          width={Math.max(0, width - padding * 2)}
          height={previewHeight}
          listening={false}
        />
      ) : (
        <KonvaText
          id={element.id}
          x={element.x + padding}
          y={element.y + padding}
          width={Math.max(0, width - padding * 2)}
          height={previewHeight}
          text={(element.fileType ?? "FILE").slice(0, 8).toUpperCase()}
          fontSize={24}
          align="center"
          fill="#64748b"
          listening={false}
        />
      )}
      <KonvaText
        id={element.id}
        x={element.x + padding}
        y={element.y + height - 24 - padding / 2}
        width={Math.max(0, width - padding * 2)}
        height={24}
        text={element.fileName ?? element.fileType ?? "Document"}
        fontSize={14}
        fill="#1f2937"
        ellipsis
        listening={false}
      />
    </Group>
  );
};

export const WhiteboardCanvas = () => {
  const stageRef = useRef<Konva.Stage>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentShape, setCurrentShape] = useState<any>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [stageSize, setStageSize] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 0,
    height: typeof window !== "undefined" ? window.innerHeight : 0,
  }));
  const { handleDrop, handleDragOver } = useDragDrop();

  const {
    activeTool,
    elements,
    addElement,
    strokeColor,
    strokeWidth,
    strokeStyle,
    fillColor,
    opacity,
    arrowType,
    sloppiness,
    pan,
    zoom,
    setPan,
    users,
    focusedElementId,
  } = useWhiteboardStore();

  const panX = pan.x;
  const panY = pan.y;
  const safeZoom = zoom || 1;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateStageSize = () => {
      setStageSize({ width: window.innerWidth, height: window.innerHeight });
    };

    updateStageSize();
    window.addEventListener("resize", updateStageSize);
    return () => window.removeEventListener("resize", updateStageSize);
  }, []);

  const miniMapData = useMemo(() => {
    if (stageSize.width === 0 || stageSize.height === 0) {
      return null;
    }

    const viewportMinX = -panX / safeZoom;
    const viewportMinY = -panY / safeZoom;
    const viewportWidth = stageSize.width / safeZoom;
    const viewportHeight = stageSize.height / safeZoom;

    let minX = viewportMinX;
    let minY = viewportMinY;
    let maxX = viewportMinX + viewportWidth;
    let maxY = viewportMinY + viewportHeight;

    elements.forEach((element) => {
      const bounds = getElementBounds(element);
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    });

    const padding = 80;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const worldWidth = Math.max(1, maxX - minX);
    const worldHeight = Math.max(1, maxY - minY);
    const mapWidth = 220;
    const mapHeight = 160;
    const scale = Math.min(mapWidth / worldWidth, mapHeight / worldHeight);

    return {
      mapWidth,
      mapHeight,
      scale,
      offsetX: minX,
      offsetY: minY,
      viewport: {
        minX: viewportMinX,
        minY: viewportMinY,
        width: viewportWidth,
        height: viewportHeight,
      },
    };
  }, [elements, panX, panY, safeZoom, stageSize.height, stageSize.width]);

  const renderBounds = useMemo(() => {
    if (stageSize.width === 0 || stageSize.height === 0) {
      return null;
    }

    const viewportMinX = -panX / safeZoom;
    const viewportMinY = -panY / safeZoom;
    const viewportWidth = stageSize.width / safeZoom;
    const viewportHeight = stageSize.height / safeZoom;
    const overscan = 800;

    return {
      minX: viewportMinX - overscan,
      minY: viewportMinY - overscan,
      maxX: viewportMinX + viewportWidth + overscan,
      maxY: viewportMinY + viewportHeight + overscan,
    };
  }, [panX, panY, safeZoom, stageSize.height, stageSize.width]);

  const visibleElements = useMemo(() => {
    if (!renderBounds) {
      return elements;
    }

    return elements.filter((element) => {
      const bounds = getElementBounds(element);
      return (
        bounds.maxX >= renderBounds.minX &&
        bounds.minX <= renderBounds.maxX &&
        bounds.maxY >= renderBounds.minY &&
        bounds.minY <= renderBounds.maxY
      );
    });
  }, [elements, renderBounds]);

  const syncPanFromStage = (event: KonvaEventObject<DragEvent>) => {
    const stage = event.target.getStage();
    if (!stage) return;
    const position = stage.position();
    setPan({ x: position.x, y: position.y });
  };

  const backgroundSize = `${Math.max(4, 20 * safeZoom)}px ${Math.max(4, 20 * safeZoom)}px`;
  const backgroundPosition = `${panX}px ${panY}px`;
  const stageCursorClass =
    activeTool === "pan"
      ? isPanning
        ? "cursor-grabbing"
        : "cursor-grab"
      : activeTool === "select"
        ? "cursor-default"
        : "cursor-crosshair";

  const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;

    if (e.evt.altKey && activeTool === "select") {
      const target = e.target;
      if (target && target !== stage) {
        const targetId = target.id();
        if (targetId) {
          const element = elements.find((item) => item.id === targetId);
          if (element) {
            const clone = duplicateElement(element);
            clone.x += 24;
            clone.y += 24;
            addElement(clone);
            e.evt.preventDefault();
            return;
          }
        }
      }
    }

    if (activeTool === "select" || activeTool === "pan") {
      return;
    }

    const pos = stage.getPointerPosition();
    if (!pos) return;

    const x = (pos.x - panX) / zoom;
    const y = (pos.y - panY) / zoom;

    setIsDrawing(true);

    const newElement: any = {
      id: nanoid(),
      x,
      y,
      strokeColor,
      strokeWidth,
      strokeStyle,
      fillColor,
      opacity,
      sloppiness,
    };

    switch (activeTool) {
      case "rectangle":
        newElement.type = "rectangle";
        newElement.width = 0;
        newElement.height = 0;
        break;
      case "ellipse":
        newElement.type = "ellipse";
        newElement.width = 0;
        newElement.height = 0;
        break;
      case "line":
      case "arrow":
        newElement.type = activeTool;
        newElement.points = [0, 0, 0, 0];
        newElement.arrowType = arrowType;
        break;
      case "pen":
        newElement.type = "pen";
        newElement.points = [0, 0];
        break;
      default:
        break;
    }

    setCurrentShape(newElement);
  };

  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    if (!isDrawing || !currentShape) return;

    const stage = stageRef.current;
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    const x = (pos.x - panX) / zoom;
    const y = (pos.y - panY) / zoom;
    const shiftPressed = e.evt.shiftKey;

    if (currentShape.type === "rectangle" || currentShape.type === "ellipse") {
      const deltaX = x - currentShape.x;
      const deltaY = y - currentShape.y;
      let width = deltaX;
      let height = deltaY;

      if (shiftPressed) {
        const size = Math.max(Math.abs(deltaX), Math.abs(deltaY));
        const widthSign = Math.sign(deltaX) || 1;
        const heightSign = Math.sign(deltaY) || 1;
        width = size * widthSign;
        height = size * heightSign;
      }

      setCurrentShape({
        ...currentShape,
        width,
        height,
      });
    } else if (currentShape.type === "line" || currentShape.type === "arrow") {
      let endX = x - currentShape.x;
      let endY = y - currentShape.y;

      if (shiftPressed) {
        const length = Math.hypot(endX, endY);
        if (length > 0) {
          const angle = Math.atan2(endY, endX);
          const step = Math.PI / 4;
          const snapped = Math.round(angle / step) * step;
          endX = Math.cos(snapped) * length;
          endY = Math.sin(snapped) * length;
        }
      }

      setCurrentShape({
        ...currentShape,
        points: [0, 0, endX, endY],
      });
    } else if (currentShape.type === "pen") {
      const newPoints = [...currentShape.points, x - currentShape.x, y - currentShape.y];
      setCurrentShape({
        ...currentShape,
        points: newPoints,
      });
    }
  };

  const handleMouseUp = () => {
    if (isDrawing && currentShape) {
      addElement(currentShape);
      setCurrentShape(null);
    }
    setIsDrawing(false);
  };

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();

    if (activeTool === "pan" || e.evt.ctrlKey) {
      const stage = stageRef.current;
      if (!stage) return;

      const oldScale = zoom;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const mousePointTo = {
        x: (pointer.x - panX) / oldScale,
        y: (pointer.y - panY) / oldScale,
      };

      const newScale = e.evt.deltaY > 0 ? oldScale * 0.95 : oldScale * 1.05;

      useWhiteboardStore.setState({
        zoom: Math.max(0.1, Math.min(5, newScale)),
        pan: {
          x: pointer.x - mousePointTo.x * newScale,
          y: pointer.y - mousePointTo.y * newScale,
        },
      });
    }
  };

  const getStrokeDash = (style: string) => {
    switch (style) {
      case "dashed":
        return [10, 5];
      case "dotted":
        return [2, 5];
      default:
        return [];
    }
  };

  return (
    <div
      className="absolute inset-0 dotted-grid"
      style={{ backgroundSize, backgroundPosition }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <Stage
        ref={stageRef}
        width={Math.max(stageSize.width, 1)}
        height={Math.max(stageSize.height, 1)}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        draggable={activeTool === "pan"}
        scaleX={zoom}
        scaleY={zoom}
        x={panX}
        y={panY}
        className={cn("h-full w-full", stageCursorClass)}
        onDragStart={() => setIsPanning(true)}
        onDragMove={syncPanFromStage}
        onDragEnd={(event) => {
          setIsPanning(false);
          syncPanFromStage(event);
        }}
      >
        <Layer>
          {/* Render all elements */}
          {visibleElements.map((element) => {
            const highlightProps =
              focusedElementId === element.id
                ? {
                    shadowColor: "#38bdf8",
                    shadowBlur: 24,
                    shadowOpacity: 0.85,
                    shadowOffsetX: 0,
                    shadowOffsetY: 0,
                  }
                : {};
            if (element.type === "rectangle") {
              return (
                <Rect
                  key={element.id}
                  id={element.id}
                  x={element.x}
                  y={element.y}
                  width={element.width}
                  height={element.height}
                  stroke={element.strokeColor}
                  strokeWidth={element.strokeWidth}
                  dash={getStrokeDash(element.strokeStyle)}
                  fill={element.fillColor}
                  opacity={element.opacity}
                  rotation={element.rotation}
                  {...highlightProps}
                />
              );
            } else if (element.type === "ellipse") {
              return (
                <Circle
                  key={element.id}
                  id={element.id}
                  x={element.x + (element.width || 0) / 2}
                  y={element.y + (element.height || 0) / 2}
                  radiusX={Math.abs((element.width || 0) / 2)}
                  radiusY={Math.abs((element.height || 0) / 2)}
                  stroke={element.strokeColor}
                  strokeWidth={element.strokeWidth}
                  dash={getStrokeDash(element.strokeStyle)}
                  fill={element.fillColor}
                  opacity={element.opacity}
                  rotation={element.rotation}
                  {...highlightProps}
                />
              );
            } else if (element.type === "line") {
              return (
                <Line
                  key={element.id}
                  id={element.id}
                  x={element.x}
                  y={element.y}
                  points={element.points}
                  stroke={element.strokeColor}
                  strokeWidth={element.strokeWidth}
                  dash={getStrokeDash(element.strokeStyle)}
                  opacity={element.opacity}
                  lineCap="round"
                  lineJoin="round"
                  {...highlightProps}
                />
              );
            } else if (element.type === "arrow") {
              const pointerAtBeginning = element.arrowType === "arrow-start" || element.arrowType === "arrow-both";
              const pointerAtEnding = element.arrowType === "arrow-end" || element.arrowType === "arrow-both";
              return (
                <Arrow
                  key={element.id}
                  id={element.id}
                  x={element.x}
                  y={element.y}
                  points={element.points}
                  stroke={element.strokeColor}
                  strokeWidth={element.strokeWidth}
                  dash={getStrokeDash(element.strokeStyle)}
                  opacity={element.opacity}
                  pointerLength={12}
                  pointerWidth={12}
                  pointerAtBeginning={pointerAtBeginning}
                  pointerAtEnding={pointerAtEnding}
                  {...highlightProps}
                />
              );
            } else if (element.type === "pen") {
              return (
                <Line
                  key={element.id}
                  id={element.id}
                  x={element.x}
                  y={element.y}
                  points={element.points}
                  stroke={element.strokeColor}
                  strokeWidth={element.strokeWidth}
                  opacity={element.opacity}
                  lineCap="round"
                  lineJoin="round"
                  tension={element.sloppiness === "smooth" ? 0.75 : element.sloppiness === "rough" ? 0.2 : 0.5}
                  {...highlightProps}
                />
              );
            } else if (element.type === "text") {
              return (
                <KonvaText
                  key={element.id}
                  id={element.id}
                  x={element.x}
                  y={element.y}
                  text={element.text || ""}
                  fontSize={20}
                  fill={element.strokeColor}
                  opacity={element.opacity}
                  {...highlightProps}
                />
              );
            } else if (element.type === "image") {
              return (
                <ImageElement key={element.id} element={element} highlight={highlightProps} />
              );
            } else if (element.type === "file") {
              return <FileElement key={element.id} element={element} highlight={highlightProps} />;
            }
            return null;
          })}

          {/* Render current drawing shape */}
          {currentShape && (
            <>
              {currentShape.type === "rectangle" && (
                <Rect
                  x={currentShape.x}
                  y={currentShape.y}
                  width={currentShape.width}
                  height={currentShape.height}
                  stroke={currentShape.strokeColor}
                  strokeWidth={currentShape.strokeWidth}
                  dash={getStrokeDash(currentShape.strokeStyle)}
                  fill={currentShape.fillColor}
                  opacity={currentShape.opacity * 0.7}
                />
              )}
              {currentShape.type === "ellipse" && (
                <Circle
                  x={currentShape.x + currentShape.width / 2}
                  y={currentShape.y + currentShape.height / 2}
                  radiusX={Math.abs(currentShape.width / 2)}
                  radiusY={Math.abs(currentShape.height / 2)}
                  stroke={currentShape.strokeColor}
                  strokeWidth={currentShape.strokeWidth}
                  dash={getStrokeDash(currentShape.strokeStyle)}
                  fill={currentShape.fillColor}
                  opacity={currentShape.opacity * 0.7}
                />
              )}
              {currentShape.type === "line" && (
                <Line
                  x={currentShape.x}
                  y={currentShape.y}
                  points={currentShape.points}
                  stroke={currentShape.strokeColor}
                  strokeWidth={currentShape.strokeWidth}
                  dash={getStrokeDash(currentShape.strokeStyle)}
                  opacity={currentShape.opacity * 0.7}
                  lineCap="round"
                  lineJoin="round"
                />
              )}
              {currentShape.type === "arrow" && (
                <Arrow
                  x={currentShape.x}
                  y={currentShape.y}
                  points={currentShape.points}
                  stroke={currentShape.strokeColor}
                  strokeWidth={currentShape.strokeWidth}
                  dash={getStrokeDash(currentShape.strokeStyle)}
                  opacity={currentShape.opacity * 0.7}
                  pointerLength={12}
                  pointerWidth={12}
                  pointerAtBeginning={currentShape.arrowType === "arrow-start" || currentShape.arrowType === "arrow-both"}
                  pointerAtEnding={currentShape.arrowType === "arrow-end" || currentShape.arrowType === "arrow-both"}
                />
              )}
              {currentShape.type === "pen" && (
                <Line
                  x={currentShape.x}
                  y={currentShape.y}
                  points={currentShape.points}
                  stroke={currentShape.strokeColor}
                  strokeWidth={currentShape.strokeWidth}
                  opacity={currentShape.opacity * 0.7}
                  lineCap="round"
                  lineJoin="round"
                  tension={currentShape.sloppiness === "smooth" ? 0.75 : currentShape.sloppiness === "rough" ? 0.2 : 0.5}
                />
              )}
            </>
          )}

          {/* Render cursors */}
          {users.map((user) => (
            <UserCursor key={user.id} user={user} pan={pan} zoom={zoom} />
          ))}
        </Layer>
      </Stage>

      {miniMapData && (
        <div className="pointer-events-none absolute bottom-6 right-6 rounded-xl border border-slate-200/80 bg-white/80 p-3 shadow-lg backdrop-blur">
          <svg
            width={miniMapData.mapWidth}
            height={miniMapData.mapHeight}
            className="block"
            viewBox={`0 0 ${miniMapData.mapWidth} ${miniMapData.mapHeight}`}
            aria-hidden="true"
          >
            <rect
              x={0}
              y={0}
              width={miniMapData.mapWidth}
              height={miniMapData.mapHeight}
              fill="#f8fafc"
              stroke="rgba(148, 163, 184, 0.45)"
              strokeWidth={1}
              rx={12}
              ry={12}
            />
            {elements.map((element) => {
              const bounds = getElementBounds(element);
              const x = (bounds.minX - miniMapData.offsetX) * miniMapData.scale;
              const y = (bounds.minY - miniMapData.offsetY) * miniMapData.scale;
              const width = Math.max(2, (bounds.maxX - bounds.minX) * miniMapData.scale);
              const height = Math.max(2, (bounds.maxY - bounds.minY) * miniMapData.scale);

              return (
                <rect
                  key={`mini-${element.id}`}
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill="rgba(148, 163, 184, 0.35)"
                  stroke="rgba(148, 163, 184, 0.55)"
                  strokeWidth={1}
                  rx={width < 6 ? 1.5 : 3}
                  ry={height < 6 ? 1.5 : 3}
                />
              );
            })}
            {(() => {
              const viewportX =
                (miniMapData.viewport.minX - miniMapData.offsetX) * miniMapData.scale;
              const viewportY =
                (miniMapData.viewport.minY - miniMapData.offsetY) * miniMapData.scale;
              const viewportWidth = Math.max(4, miniMapData.viewport.width * miniMapData.scale);
              const viewportHeight = Math.max(4, miniMapData.viewport.height * miniMapData.scale);

              return (
                <rect
                  x={viewportX}
                  y={viewportY}
                  width={viewportWidth}
                  height={viewportHeight}
                  fill="rgba(14, 165, 233, 0.1)"
                  stroke="#0284c7"
                  strokeWidth={1.5}
                  rx={6}
                  ry={6}
                />
              );
            })()}
          </svg>
        </div>
      )}
    </div>
  );
};
