"use client";

import {
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { createPortal } from "react-dom";
import { Stage, Layer, Rect, Circle, Line, Text as KonvaText, Arrow, Image as KonvaImage, Group } from "react-konva";
import { useWhiteboardStore } from "@/lib/store/useWhiteboardStore";
import type { CanvasElement, ArrowStyle, TextAlignment } from "@/lib/store/useWhiteboardStore";
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

const getDiamondShape = (
  x: number,
  y: number,
  width = 0,
  height = 0,
) => {
  const bounds = normalizeRectBounds(x, y, width, height);
  const drawWidth = bounds.maxX - bounds.minX;
  const drawHeight = bounds.maxY - bounds.minY;

  return {
    x: bounds.minX,
    y: bounds.minY,
    points: [
      drawWidth / 2,
      0,
      drawWidth,
      drawHeight / 2,
      drawWidth / 2,
      drawHeight,
      0,
      drawHeight / 2,
    ],
  };
};

const getElementBounds = (element: CanvasElement): Bounds => {
  switch (element.type) {
    case "rectangle":
    case "diamond":
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

type EditingTextState = {
  id: string;
  x: number;
  y: number;
  value: string;
  initialValue: string;
  width: number;
  fontSize: number;
  fontFamily: string;
  alignment: TextAlignment;
};

const TEXT_MIN_WIDTH = 160;
const TEXT_MAX_WIDTH = 460;
const TEXT_BASE_PADDING = 24;

const FONT_FALLBACKS: Record<string, string> = {
  Inter: "Inter, sans-serif",
  "DM Sans": '"DM Sans", sans-serif',
  "Roboto Mono": '"Roboto Mono", monospace',
};

const getFontFamilyCss = (fontFamily?: string) => {
  if (!fontFamily) return FONT_FALLBACKS.Inter;
  return FONT_FALLBACKS[fontFamily] ?? fontFamily;
};

const getLineHeight = (fontSize: number) => Math.round(fontSize * 1.4);

const estimateTextBoxWidth = (text: string, fontSize: number) => {
  const lines = (text ?? "").split(/\r?\n/);
  const longestLineLength = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const approxCharWidth = fontSize * 0.6;
  const widthFromContent = Math.max(TEXT_MIN_WIDTH, longestLineLength * approxCharWidth + TEXT_BASE_PADDING);
  return Math.min(TEXT_MAX_WIDTH, widthFromContent || TEXT_MIN_WIDTH);
};

const estimateTextBoxHeight = (text: string, fontSize: number) => {
  const lineCount = Math.max(1, (text ?? "").split(/\r?\n/).length);
  const lineHeight = getLineHeight(fontSize);
  return Math.max(lineCount * lineHeight + TEXT_BASE_PADDING / 2, lineHeight + TEXT_BASE_PADDING / 2);
};

const getArrowRenderConfig = (points: number[] | undefined, style: ArrowStyle | undefined) => {
  if (!points || points.length < 4) {
    return { points: points ?? [], bezier: false };
  }

  if (style !== "curve") {
    return { points, bezier: false };
  }

  const [startX, startY, endX, endY] = points;
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  const normalX = -dy / length;
  const normalY = dx / length;
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  const offset = Math.min(120, length * 0.3);
  const controlX = midX + normalX * offset;
  const controlY = midY + normalY * offset;

  return {
    bezier: true,
    points: [startX, startY, controlX, controlY, controlX, controlY, endX, endY],
  };
};

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
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const textEditorRef = useRef<HTMLTextAreaElement>(null);
  const editingTextRef = useRef<EditingTextState | null>(null);
  const miniMapDragRef = useRef(false);
  const skipNextPointerRef = useRef(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentShape, setCurrentShape] = useState<any>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [stageSize, setStageSize] = useState(() => ({
    width: 0,
    height: 0,
  }));
  const [editingText, setEditingText] = useState<EditingTextState | null>(null);
  const [isMiniMapInteracting, setIsMiniMapInteracting] = useState(false);
  const [miniMapContainer, setMiniMapContainer] = useState<HTMLElement | null>(null);
  const { handleDrop, handleDragOver } = useDragDrop();

  useEffect(() => {
    const updateContainer = () => {
      if (typeof document === "undefined") return;
      const node = document.getElementById("right-sidebar-minimap");
      setMiniMapContainer((current) => (current === node ? current : node));
    };

    updateContainer();

    if (typeof MutationObserver === "undefined") {
      return;
    }

    const sidebarRoot = document.getElementById("right-sidebar-root");
    const observerTarget = sidebarRoot ?? document.body;

    if (!observerTarget) {
      return;
    }

    const observer = new MutationObserver(updateContainer);
    observer.observe(observerTarget, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
    };
  }, []);

  const {
    activeTool,
    elements,
    addElement,
    updateElement,
    deleteElement,
    strokeColor,
    strokeWidth,
    strokeStyle,
    fillColor,
    opacity,
    arrowType,
    arrowStyle,
    sloppiness,
    rectangleCornerStyle,
    penBackground,
    textFontFamily,
    textFontSize,
    textAlign,
    pan,
    zoom,
    setPan,
    setSelectedIds,
    users,
    focusedElementId,
  } = useWhiteboardStore();

  const panX = pan.x;
  const panY = pan.y;
  const safeZoom = zoom || 1;

  const getCanvasPointerPosition = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    return {
      x: (pos.x - panX) / safeZoom,
      y: (pos.y - panY) / safeZoom,
    };
  }, [panX, safeZoom, panY]);

  const beginTextEditing = useCallback(
    (element: CanvasElement, options?: { value?: string; width?: number }) => {
      const initialValue = element.text ?? "";
      const value = options?.value ?? initialValue;
      const fontSize = element.fontSize ?? textFontSize;
      const fontFamily = element.fontFamily ?? textFontFamily;
      const alignment = element.textAlign ?? textAlign;
      const width = options?.width ?? element.width ?? estimateTextBoxWidth(value || initialValue, fontSize);
      const editingState: EditingTextState = {
        id: element.id,
        x: element.x,
        y: element.y,
        value,
        initialValue,
        width,
        fontSize,
        fontFamily,
        alignment,
      };
      setSelectedIds([element.id]);
      setEditingText(editingState);
    },
    [setSelectedIds, textAlign, textFontFamily, textFontSize],
  );

  const finishEditingText = useCallback(
    (options?: { cancel?: boolean; skipNextPointer?: boolean }) => {
      const current = editingTextRef.current;
      if (!current) {
        return;
      }

      editingTextRef.current = null;
      setEditingText(null);

      if (options?.skipNextPointer) {
        skipNextPointerRef.current = true;
      }

      if (options?.cancel) {
        if (current.initialValue) {
          updateElement(current.id, { text: current.initialValue });
        } else {
          deleteElement(current.id);
        }
        return;
      }

      const trimmed = current.value.trim();
      if (!trimmed) {
        deleteElement(current.id);
        return;
      }

      updateElement(current.id, {
        text: trimmed,
        fontSize: current.fontSize,
        fontFamily: current.fontFamily,
        textAlign: current.alignment,
        width: current.width,
      });
    },
    [deleteElement, updateElement],
  );

  const cancelIfEditing = useCallback(() => {
    if (editingTextRef.current) {
      finishEditingText();
      return true;
    }
    return false;
  }, [finishEditingText]);

  const handleStageDoublePointer = useCallback(
    (event: KonvaEventObject<Event>) => {
      const stage = stageRef.current;
      if (!stage) return;

      const target = event.target;
      if (target && target !== stage) {
        const targetId = target.id();
        if (!targetId) return;
        const element = elements.find((item) => item.id === targetId);
        if (element?.type === "text") {
          event.evt.preventDefault();
          beginTextEditing(element);
        }
      }
    },
    [beginTextEditing, elements],
  );

  const getMiniMapCoordinates = useCallback(
    (event: ReactMouseEvent<SVGSVGElement> | ReactTouchEvent<SVGSVGElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      if ("touches" in event) {
        const touch = event.touches[0];
        if (!touch) return null;
        return {
          x: touch.clientX - rect.left,
          y: touch.clientY - rect.top,
        };
      }
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    },
    [],
  );

  useEffect(() => {
    editingTextRef.current = editingText;
  }, [editingText]);

  useEffect(() => {
    if (!editingText) {
      return;
    }

    const textarea = textEditorRef.current;
    if (!textarea) {
      return;
    }

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
  }, [editingText]);

  const miniMapData = useMemo(() => {
    if (stageSize.width === 0 || stageSize.height === 0) {
      return null;
    }

    const viewportMinX = -panX / safeZoom;
    const viewportMinY = -panY / safeZoom;
    const viewportWidth = stageSize.width / safeZoom;
    const viewportHeight = stageSize.height / safeZoom;
    const mapWidth = 220;
    const mapHeight = 160;

    if (elements.length === 0) {
      const anchorCenterX = viewportWidth / 2;
      const anchorCenterY = viewportHeight / 2;
      const defaultHalfWidth = viewportWidth * 2;
      const defaultHalfHeight = viewportHeight * 2;
      const minX = anchorCenterX - defaultHalfWidth;
      const minY = anchorCenterY - defaultHalfHeight;
      const maxX = anchorCenterX + defaultHalfWidth;
      const maxY = anchorCenterY + defaultHalfHeight;

      const worldWidth = Math.max(1, maxX - minX);
      const worldHeight = Math.max(1, maxY - minY);
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
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    elements.forEach((element) => {
      const bounds = getElementBounds(element);
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    });

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      minX = viewportMinX;
      minY = viewportMinY;
      maxX = viewportMinX + viewportWidth;
      maxY = viewportMinY + viewportHeight;
    }

    const padding = 80;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const viewportMaxX = viewportMinX + viewportWidth;
    const viewportMaxY = viewportMinY + viewportHeight;

    minX = Math.min(minX, viewportMinX);
    minY = Math.min(minY, viewportMinY);
    maxX = Math.max(maxX, viewportMaxX);
    maxY = Math.max(maxY, viewportMaxY);

    const worldWidth = Math.max(1, maxX - minX);
    const worldHeight = Math.max(1, maxY - minY);
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

  const panToMiniMapPoint = useCallback(
    (pointX: number, pointY: number) => {
      if (!miniMapData) return;

      const worldX = pointX / miniMapData.scale + miniMapData.offsetX;
      const worldY = pointY / miniMapData.scale + miniMapData.offsetY;

      const viewportWidth = stageSize.width / safeZoom;
      const viewportHeight = stageSize.height / safeZoom;

      const nextPanX = -(worldX - viewportWidth / 2) * safeZoom;
      const nextPanY = -(worldY - viewportHeight / 2) * safeZoom;

      setPan({
        x: Number.isFinite(nextPanX) ? nextPanX : panX,
        y: Number.isFinite(nextPanY) ? nextPanY : panY,
      });
    },
    [miniMapData, panX, panY, safeZoom, setPan, stageSize.height, stageSize.width],
  );

  const updatePanFromMiniMap = useCallback(
    (event: ReactMouseEvent<SVGSVGElement> | ReactTouchEvent<SVGSVGElement>) => {
      const coords = getMiniMapCoordinates(event);
      if (!coords) return;
      panToMiniMapPoint(coords.x, coords.y);
    },
    [getMiniMapCoordinates, panToMiniMapPoint],
  );

  const handleMiniMapPointerDown = useCallback(
    (event: ReactMouseEvent<SVGSVGElement> | ReactTouchEvent<SVGSVGElement>) => {
      event.preventDefault();
      event.stopPropagation();
      miniMapDragRef.current = true;
      setIsMiniMapInteracting(true);
      updatePanFromMiniMap(event);
    },
    [updatePanFromMiniMap],
  );

  const handleMiniMapPointerMove = useCallback(
    (event: ReactMouseEvent<SVGSVGElement> | ReactTouchEvent<SVGSVGElement>) => {
      if (!miniMapDragRef.current) return;
      event.preventDefault();
      updatePanFromMiniMap(event);
    },
    [updatePanFromMiniMap],
  );

  const endMiniMapInteraction = useCallback(() => {
    miniMapDragRef.current = false;
    setIsMiniMapInteracting(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const element = containerRef.current;
    if (!element) {
      return;
    }

    if (typeof window.ResizeObserver === "undefined") {
      const rect = element.getBoundingClientRect();
      setStageSize({ width: rect.width, height: rect.height });
      return;
    }

    const observer = new window.ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setStageSize({ width, height });
    });

    const rect = element.getBoundingClientRect();
    setStageSize({ width: rect.width, height: rect.height });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    editingTextRef.current = editingText;
  }, [editingText]);

  useEffect(() => {
    if (!editingText) {
      return;
    }

    const textarea = textEditorRef.current;
    if (!textarea) {
      return;
    }

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
  }, [editingText]);

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

  const miniMapContent = miniMapData ? (
    <div
      className={cn(
        "pointer-events-auto w-full rounded-xl border border-slate-200/80 bg-white/80 p-3 backdrop-blur transition-shadow",
        isMiniMapInteracting ? "shadow-xl ring-1 ring-sky-200/70" : "shadow-lg",
      )}
    >
      <svg
        width={miniMapData.mapWidth}
        height={miniMapData.mapHeight}
        className={cn(
          "block h-auto w-full max-h-[200px] select-none sm:max-h-[240px]",
          isMiniMapInteracting ? "cursor-grabbing" : "cursor-pointer",
        )}
        viewBox={`0 0 ${miniMapData.mapWidth} ${miniMapData.mapHeight}`}
        aria-hidden="true"
        onMouseDown={handleMiniMapPointerDown}
        onMouseMove={handleMiniMapPointerMove}
        onMouseUp={(event) => {
          event.preventDefault();
          endMiniMapInteraction();
        }}
        onMouseLeave={endMiniMapInteraction}
        onTouchStart={handleMiniMapPointerDown}
        onTouchMove={handleMiniMapPointerMove}
        onTouchEnd={(event) => {
          event.preventDefault();
          endMiniMapInteraction();
        }}
        onTouchCancel={endMiniMapInteraction}
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
  ) : null;

  const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;

    if (skipNextPointerRef.current) {
      skipNextPointerRef.current = false;
      e.evt.preventDefault();
      return;
    }

    if (cancelIfEditing()) {
      e.evt.preventDefault();
      return;
    }

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

    if (activeTool === "text") {
      const target = e.target;
      if (target && target !== stage) {
        const targetId = target.id();
        if (targetId) {
          const element = elements.find((item) => item.id === targetId);
          if (element?.type === "text") {
            e.evt.preventDefault();
            beginTextEditing(element);
            return;
          }
        }
      }

      const pointer = getCanvasPointerPosition();
      if (!pointer) return;

      const newText: CanvasElement = {
        id: nanoid(),
        type: "text",
        x: pointer.x,
        y: pointer.y,
        text: "",
        strokeColor,
        fillColor,
        strokeWidth,
        strokeStyle,
        opacity,
        sloppiness,
        fontFamily: textFontFamily,
        fontSize: textFontSize,
        textAlign,
      };
      addElement(newText);
      beginTextEditing(newText, { width: estimateTextBoxWidth("", textFontSize) });
      return;
    }

    if (activeTool === "select" || activeTool === "pan") {
      return;
    }

    const pointer = getCanvasPointerPosition();
    if (!pointer) return;

    const { x, y } = pointer;

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
        newElement.cornerRadius = rectangleCornerStyle === "rounded" ? 16 : 0;
        break;
      case "diamond":
        newElement.type = "diamond";
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
        newElement.arrowStyle = arrowStyle;
        break;
      case "pen":
        newElement.type = "pen";
        newElement.points = [0, 0];
        newElement.penBackground = penBackground;
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

    if (
      currentShape.type === "rectangle" ||
      currentShape.type === "diamond" ||
      currentShape.type === "ellipse"
    ) {
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

  const editorHeight = editingText
    ? estimateTextBoxHeight(editingText.value, editingText.fontSize)
    : 0;
  const editorLineHeight = editingText ? getLineHeight(editingText.fontSize) : 0;
  const editorStyle = editingText
    ? {
        left: panX + editingText.x * safeZoom,
        top: panY + editingText.y * safeZoom,
        width: editingText.width * safeZoom,
        height: editorHeight * safeZoom,
        fontSize: editingText.fontSize * safeZoom,
        padding: `${12 * safeZoom}px`,
        borderRadius: `${12 * safeZoom}px`,
        fontFamily: getFontFamilyCss(editingText.fontFamily),
        textAlign: editingText.alignment,
      }
    : undefined;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 dotted-grid"
      style={{ backgroundSize, backgroundPosition }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {editingText && editorStyle && (
        <textarea
          ref={textEditorRef}
          className="pointer-events-auto absolute z-40 resize-none border-2 border-sky-400 bg-white/95 text-slate-800 shadow-lg outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200/80"
          style={{
            ...editorStyle,
            lineHeight: `${editorLineHeight * safeZoom}px`,
          }}
          value={editingText.value}
          onChange={(event) => {
            const { value } = event.target;
            setEditingText((current) => {
              if (!current) return current;
              return {
                ...current,
                value,
                width: estimateTextBoxWidth(value, current.fontSize),
              };
            });
          }}
          onBlur={() => finishEditingText({ skipNextPointer: true })}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              finishEditingText({ cancel: true });
            }
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              finishEditingText();
            }
          }}
          spellCheck
          placeholder="Type something"
        />
      )}
      <Stage
        ref={stageRef}
        width={Math.max(stageSize.width, 1)}
        height={Math.max(stageSize.height, 1)}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDblClick={handleStageDoublePointer}
        onDblTap={handleStageDoublePointer}
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
            const isEditingElement = editingText?.id === element.id;
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
                  cornerRadius={element.cornerRadius ?? 0}
                  {...highlightProps}
                />
              );
            } else if (element.type === "diamond") {
              const diamond = getDiamondShape(
                element.x,
                element.y,
                element.width ?? 0,
                element.height ?? 0,
              );
              return (
                <Line
                  key={element.id}
                  id={element.id}
                  x={diamond.x}
                  y={diamond.y}
                  points={diamond.points}
                  stroke={element.strokeColor}
                  strokeWidth={element.strokeWidth}
                  dash={getStrokeDash(element.strokeStyle)}
                  fill={element.fillColor}
                  opacity={element.opacity}
                  rotation={element.rotation}
                  closed
                  lineJoin="round"
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
              const { points: arrowPoints, bezier } = getArrowRenderConfig(element.points, element.arrowStyle);
              return (
                <Arrow
                  key={element.id}
                  id={element.id}
                  x={element.x}
                  y={element.y}
                  points={arrowPoints}
                  stroke={element.strokeColor}
                  strokeWidth={element.strokeWidth}
                  dash={getStrokeDash(element.strokeStyle)}
                  opacity={element.opacity}
                  pointerLength={12}
                  pointerWidth={12}
                  pointerAtBeginning={pointerAtBeginning}
                  pointerAtEnding={pointerAtEnding}
                  bezier={bezier}
                  tension={bezier ? 0.4 : 0}
                  {...highlightProps}
                />
              );
            } else if (element.type === "pen") {
              const hasBackground = element.penBackground && element.penBackground !== "transparent";
              const backgroundOpacity = element.opacity * 0.4 + 0.2;
              return (
                <>
                  {hasBackground && (
                    <Line
                      key={`${element.id}-background`}
                      id={`${element.id}-background`}
                      x={element.x}
                      y={element.y}
                      points={element.points}
                      stroke={element.penBackground}
                      strokeWidth={element.strokeWidth + 12}
                      opacity={Math.min(1, backgroundOpacity)}
                      lineCap="round"
                      lineJoin="round"
                      tension={element.sloppiness === "smooth" ? 0.75 : element.sloppiness === "rough" ? 0.2 : 0.5}
                      listening={false}
                    />
                  )}
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
                </>
              );
            } else if (element.type === "text") {
              if (isEditingElement) {
                return null;
              }
              const elementFontSize = element.fontSize ?? textFontSize;
              const lineHeightRatio = elementFontSize
                ? getLineHeight(elementFontSize) / elementFontSize
                : 1.4;
              return (
                <KonvaText
                  key={element.id}
                  id={element.id}
                  x={element.x}
                  y={element.y}
                  text={element.text || ""}
                  fontSize={elementFontSize}
                  fontFamily={getFontFamilyCss(element.fontFamily)}
                  lineHeight={lineHeightRatio}
                  align={(element.textAlign as TextAlignment) ?? "left"}
                  fill={element.strokeColor}
                  opacity={element.opacity}
                  width={element.width}
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
                  cornerRadius={currentShape.cornerRadius ?? 0}
                />
              )}
              {currentShape.type === "diamond" && (
                (() => {
                  const diamond = getDiamondShape(
                    currentShape.x,
                    currentShape.y,
                    currentShape.width ?? 0,
                    currentShape.height ?? 0,
                  );
                  return (
                    <Line
                      x={diamond.x}
                      y={diamond.y}
                      points={diamond.points}
                      stroke={currentShape.strokeColor}
                      strokeWidth={currentShape.strokeWidth}
                      dash={getStrokeDash(currentShape.strokeStyle)}
                      fill={currentShape.fillColor}
                      opacity={currentShape.opacity * 0.7}
                      closed
                      lineJoin="round"
                    />
                  );
                })()
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
                (() => {
                  const { points: arrowPoints, bezier } = getArrowRenderConfig(
                    currentShape.points,
                    currentShape.arrowStyle,
                  );
                  const pointerAtBeginning =
                    currentShape.arrowType === "arrow-start" || currentShape.arrowType === "arrow-both";
                  const pointerAtEnding =
                    currentShape.arrowType === "arrow-end" || currentShape.arrowType === "arrow-both";
                  return (
                    <Arrow
                      x={currentShape.x}
                      y={currentShape.y}
                      points={arrowPoints}
                      stroke={currentShape.strokeColor}
                      strokeWidth={currentShape.strokeWidth}
                      dash={getStrokeDash(currentShape.strokeStyle)}
                      opacity={currentShape.opacity * 0.7}
                      pointerLength={12}
                      pointerWidth={12}
                      pointerAtBeginning={pointerAtBeginning}
                      pointerAtEnding={pointerAtEnding}
                      bezier={bezier}
                      tension={bezier ? 0.4 : 0}
                    />
                  );
                })()
              )}
              {currentShape.type === "pen" && (
                (() => {
                  const hasBackground = currentShape.penBackground && currentShape.penBackground !== "transparent";
                  const backgroundOpacity = currentShape.opacity * 0.4 + 0.2;
                  return (
                    <>
                      {hasBackground && (
                        <Line
                          x={currentShape.x}
                          y={currentShape.y}
                          points={currentShape.points}
                          stroke={currentShape.penBackground}
                          strokeWidth={currentShape.strokeWidth + 12}
                          opacity={Math.min(1, backgroundOpacity)}
                          lineCap="round"
                          lineJoin="round"
                          tension={
                            currentShape.sloppiness === "smooth"
                              ? 0.75
                              : currentShape.sloppiness === "rough"
                              ? 0.2
                              : 0.5
                          }
                          listening={false}
                        />
                      )}
                      <Line
                        x={currentShape.x}
                        y={currentShape.y}
                        points={currentShape.points}
                        stroke={currentShape.strokeColor}
                        strokeWidth={currentShape.strokeWidth}
                        opacity={currentShape.opacity * 0.7}
                        lineCap="round"
                        lineJoin="round"
                        tension={
                          currentShape.sloppiness === "smooth"
                            ? 0.75
                            : currentShape.sloppiness === "rough"
                            ? 0.2
                            : 0.5
                        }
                      />
                    </>
                  );
                })()
              )}
            </>
          )}

          {/* Render cursors */}
          {users.map((user) => (
            <UserCursor key={user.id} user={user} pan={pan} zoom={zoom} />
          ))}
        </Layer>
      </Stage>

      {miniMapContent &&
        (miniMapContainer
          ? createPortal(miniMapContent, miniMapContainer)
          : (
              <div className="pointer-events-none absolute bottom-6 left-6 z-30 w-max max-w-[200px] sm:max-w-[240px] [&>*]:pointer-events-auto">
                {miniMapContent}
              </div>
            ))}
    </div>
  );
};
