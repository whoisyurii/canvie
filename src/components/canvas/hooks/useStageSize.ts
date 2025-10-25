"use client";

import { useEffect, useState, type RefObject } from "react";

type StageSize = {
  width: number;
  height: number;
};

export const useStageSize = (containerRef: RefObject<HTMLDivElement>) => {
  const [stageSize, setStageSize] = useState<StageSize>({ width: 0, height: 0 });

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
  }, [containerRef]);

  return stageSize;
};
