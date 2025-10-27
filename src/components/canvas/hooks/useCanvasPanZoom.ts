import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import Konva from "konva";

import { useWhiteboardStore, type Tool } from "@/lib/store/useWhiteboardStore";

type UseCanvasPanZoomArgs = {
  stageRef: RefObject<Konva.Stage | null>;
  pan: { x: number; y: number };
  setPan: (pan: { x: number; y: number }) => void;
  safeZoom: number;
  activeTool: Tool;
};

type StageDragHandlers = {
  handleStageDragStart: () => void;
  handleStageDragMove: (event: KonvaEventObject<DragEvent>) => void;
  handleStageDragEnd: (event: KonvaEventObject<DragEvent>) => void;
};

export type UseCanvasPanZoomResult = {
  isPanning: boolean;
  isMiddleMousePanning: boolean;
  stopMiddleMousePan: () => void;
  handlePanMouseDown: (event: KonvaEventObject<MouseEvent>) => boolean;
  handleWheel: (event: KonvaEventObject<WheelEvent>) => void;
  stageCursorClass: string;
  isPanMode: boolean;
  stageDragHandlers: StageDragHandlers;
};

export const useCanvasPanZoom = ({
  stageRef,
  pan,
  setPan,
  safeZoom,
  activeTool,
}: UseCanvasPanZoomArgs): UseCanvasPanZoomResult => {
  const [isPanning, setIsPanning] = useState(false);
  const [isMiddleMousePanning, setIsMiddleMousePanning] = useState(false);
  const panAnimationFrameRef = useRef<number | null>(null);
  const pendingPanRef = useRef<{ x: number; y: number } | null>(null);

  const panX = pan.x;
  const panY = pan.y;

  const schedulePanUpdate = useCallback(
    (nextPan: { x: number; y: number }, immediate = false) => {
      const normalizedPan = {
        x: Number.isFinite(nextPan.x) ? nextPan.x : 0,
        y: Number.isFinite(nextPan.y) ? nextPan.y : 0,
      };

      if (normalizedPan.x === panX && normalizedPan.y === panY) {
        if (immediate && panAnimationFrameRef.current !== null) {
          cancelAnimationFrame(panAnimationFrameRef.current);
          panAnimationFrameRef.current = null;
        }
        pendingPanRef.current = null;
        return;
      }

      if (immediate) {
        if (panAnimationFrameRef.current !== null) {
          cancelAnimationFrame(panAnimationFrameRef.current);
          panAnimationFrameRef.current = null;
        }
        pendingPanRef.current = null;
        setPan(normalizedPan);
        return;
      }

      pendingPanRef.current = normalizedPan;
      if (panAnimationFrameRef.current !== null) {
        return;
      }

      panAnimationFrameRef.current = requestAnimationFrame(() => {
        if (pendingPanRef.current) {
          setPan(pendingPanRef.current);
          pendingPanRef.current = null;
        }
        panAnimationFrameRef.current = null;
      });
    },
    [panX, panY, setPan],
  );

  useEffect(() => {
    return () => {
      if (panAnimationFrameRef.current !== null) {
        cancelAnimationFrame(panAnimationFrameRef.current);
        panAnimationFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || isPanning) return;

    const position = stage.position();
    if (position.x !== panX || position.y !== panY) {
      stage.position({ x: panX, y: panY });
      stage.batchDraw();
    }
  }, [panX, panY, isPanning, stageRef]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    if (stage.scaleX() !== safeZoom || stage.scaleY() !== safeZoom) {
      stage.scale({ x: safeZoom, y: safeZoom });
      stage.batchDraw();
    }
  }, [safeZoom, stageRef]);

  const syncPanFromStage = useCallback(
    (event: KonvaEventObject<DragEvent>) => {
      const stage = event.target.getStage();
      if (!stage) return;
      const position = stage.position();
      schedulePanUpdate({ x: position.x, y: position.y });
    },
    [schedulePanUpdate],
  );

  const syncPanFromStageImmediate = useCallback(
    (event: KonvaEventObject<DragEvent>) => {
      const stage = event.target.getStage();
      if (!stage) return;
      const position = stage.position();
      schedulePanUpdate({ x: position.x, y: position.y }, true);
    },
    [schedulePanUpdate],
  );

  const handleWheel = useCallback(
    (event: KonvaEventObject<WheelEvent>) => {
      const stage = stageRef.current;
      if (!stage) return;

      event.evt.preventDefault();

      const { deltaX, deltaY, ctrlKey, metaKey } = event.evt;
      const isZoomGesture = ctrlKey || metaKey;

      if (!isZoomGesture) {
        const nextPan = {
          x: panX - (Number.isFinite(deltaX) ? deltaX : 0),
          y: panY - (Number.isFinite(deltaY) ? deltaY : 0),
        };
        schedulePanUpdate(nextPan);
        return;
      }

      const currentScale = Number.isFinite(safeZoom) ? safeZoom : 1;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const mousePointTo = {
        x: (pointer.x - panX) / currentScale,
        y: (pointer.y - panY) / currentScale,
      };

      const rawScale = deltaY > 0 ? currentScale * 0.95 : currentScale * 1.05;
      const nextScale = Math.max(0.1, Math.min(5, Number.isFinite(rawScale) ? rawScale : 1));
      if (!Number.isFinite(nextScale)) {
        return;
      }

      useWhiteboardStore.setState({
        zoom: nextScale,
        pan: {
          x: pointer.x - mousePointTo.x * nextScale,
          y: pointer.y - mousePointTo.y * nextScale,
        },
      });
    },
    [panX, panY, safeZoom, schedulePanUpdate, stageRef],
  );

  const stopMiddleMousePan = useCallback(() => {
    setIsMiddleMousePanning(false);
  }, []);

  const handlePanMouseDown = useCallback(
    (event: KonvaEventObject<MouseEvent>) => {
      if (event.evt.button !== 1) {
        return false;
      }

      const stage = stageRef.current;
      if (!stage) {
        return false;
      }

      event.evt.preventDefault();
      setIsMiddleMousePanning(true);
      requestAnimationFrame(() => {
        stage.startDrag();
      });

      return true;
    },
    [stageRef],
  );

  const stageDragHandlers = useMemo<StageDragHandlers>(
    () => ({
      handleStageDragStart: () => setIsPanning(true),
      handleStageDragMove: syncPanFromStage,
      handleStageDragEnd: (event: KonvaEventObject<DragEvent>) => {
        setIsPanning(false);
        stopMiddleMousePan();
        syncPanFromStageImmediate(event);
      },
    }),
    [stopMiddleMousePan, syncPanFromStage, syncPanFromStageImmediate],
  );

  const isPanMode = activeTool === "pan" || isMiddleMousePanning;

  const stageCursorClass = useMemo(() => {
    if (isPanMode) {
      return isPanning ? "cursor-grabbing" : "cursor-grab";
    }

    if (activeTool === "select") {
      return "cursor-default";
    }

    return "cursor-crosshair";
  }, [activeTool, isPanMode, isPanning]);

  return {
    isPanning,
    isMiddleMousePanning,
    stopMiddleMousePan,
    handlePanMouseDown,
    handleWheel,
    stageCursorClass,
    isPanMode,
    stageDragHandlers,
  };
};

