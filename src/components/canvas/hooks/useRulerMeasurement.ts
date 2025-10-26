import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KonvaEventObject } from "konva/lib/Node";

import type { RulerMeasurement } from "../RulerOverlay";

type PointerPosition = { x: number; y: number };

type UseRulerMeasurementArgs = {
  isRulerMode: boolean;
  getCanvasPointerPosition: () => PointerPosition | null;
};

export type UseRulerMeasurementResult = {
  rulerMeasurement: RulerMeasurement | null;
  handlePointerDown: (event: KonvaEventObject<MouseEvent>) => boolean;
  handlePointerMove: (event: KonvaEventObject<MouseEvent>) => boolean;
  handlePointerUp: () => void;
  handleGlobalPointerUp: () => void;
  handleMouseLeave: () => void;
};

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName?.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.getAttribute("role") === "textbox"
  );
};

export const useRulerMeasurement = ({
  isRulerMode,
  getCanvasPointerPosition,
}: UseRulerMeasurementArgs): UseRulerMeasurementResult => {
  const measurementStartRef = useRef<PointerPosition | null>(null);
  const rulerMeasurementRef = useRef<RulerMeasurement | null>(null);
  const [rulerMeasurement, setRulerMeasurement] = useState<RulerMeasurement | null>(null);

  const clearMeasurement = useCallback(() => {
    measurementStartRef.current = null;
    rulerMeasurementRef.current = null;
    setRulerMeasurement(null);
  }, []);

  const updateMeasurement = useCallback((nextPosition: PointerPosition) => {
    const start = measurementStartRef.current;
    if (!start) {
      return;
    }

    const deltaX = nextPosition.x - start.x;
    const deltaY = nextPosition.y - start.y;
    const distance = Math.hypot(deltaX, deltaY);
    const angle = ((Math.atan2(deltaY, deltaX) * 180) / Math.PI + 360) % 360;

    const measurement: RulerMeasurement = {
      start,
      end: nextPosition,
      deltaX,
      deltaY,
      distance,
      angle,
    };

    rulerMeasurementRef.current = measurement;
    setRulerMeasurement(measurement);
  }, []);

  const beginMeasurement = useCallback(
    (start: PointerPosition) => {
      measurementStartRef.current = start;
      updateMeasurement(start);
    },
    [updateMeasurement],
  );

  useEffect(() => {
    if (!isRulerMode) {
      clearMeasurement();
    }
  }, [clearMeasurement, isRulerMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Shift" || event.repeat || !isRulerMode) {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      const pointer = getCanvasPointerPosition();
      if (!pointer) {
        return;
      }

      beginMeasurement(pointer);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Shift") {
        return;
      }

      clearMeasurement();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [beginMeasurement, clearMeasurement, getCanvasPointerPosition, isRulerMode]);

  const handlePointerDown = useCallback(
    (event: KonvaEventObject<MouseEvent>) => {
      if (!isRulerMode || event.evt.button !== 0) {
        return false;
      }

      event.evt.preventDefault();

      if (event.evt.shiftKey) {
        return true;
      }

      const pointer = getCanvasPointerPosition();
      if (!pointer) {
        return true;
      }

      beginMeasurement(pointer);
      return true;
    },
    [beginMeasurement, getCanvasPointerPosition, isRulerMode],
  );

  const handlePointerMove = useCallback(
    (event: KonvaEventObject<MouseEvent>) => {
      if (!isRulerMode) {
        return false;
      }

      const pointer = getCanvasPointerPosition();
      if (!pointer) {
        return true;
      }

      if (!measurementStartRef.current && event.evt.shiftKey) {
        beginMeasurement(pointer);
        return true;
      }

      if (measurementStartRef.current) {
        updateMeasurement(pointer);
        return true;
      }

      return false;
    },
    [beginMeasurement, getCanvasPointerPosition, isRulerMode, updateMeasurement],
  );

  const handlePointerUp = useCallback(() => {
    clearMeasurement();
  }, [clearMeasurement]);

  const handleGlobalPointerUp = useCallback(() => {
    if (rulerMeasurementRef.current) {
      clearMeasurement();
    }
  }, [clearMeasurement]);

  const handleMouseLeave = useCallback(() => {
    clearMeasurement();
  }, [clearMeasurement]);

  return useMemo(
    () => ({
      rulerMeasurement,
      handlePointerDown,
      handlePointerMove,
      handlePointerUp,
      handleGlobalPointerUp,
      handleMouseLeave,
    }),
    [
      handleGlobalPointerUp,
      handleMouseLeave,
      handlePointerDown,
      handlePointerMove,
      handlePointerUp,
      rulerMeasurement,
    ],
  );
};

