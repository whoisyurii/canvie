"use client";

import { useEffect, useState } from "react";
import { Group, Rect, Text as KonvaText, Image as KonvaImage } from "react-konva";
import type { CanvasElement } from "@/lib/store/useWhiteboardStore";

type HighlightProps = Record<string, unknown> | undefined;

interface ImageElementProps {
  element: CanvasElement;
  highlight?: HighlightProps;
  interaction?: Record<string, any>;
}

export const ImageElement = ({ element, highlight, interaction }: ImageElementProps) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!element.fileUrl) return;

    setHasError(false);
    const img = new window.Image();
    img.src = element.fileUrl;
    img.onload = () => setImage(img);
    img.onerror = () => {
      console.warn(`Failed to load image: ${element.fileUrl}`);
      setHasError(true);
      setImage(null);
    };

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [element.fileUrl]);

  // Show placeholder if image failed to load (e.g., invalid blob URL from collaborator)
  if (hasError) {
    const width = element.width ?? 200;
    const height = element.height ?? 200;

    return (
      <Group
        id={element.id}
        x={element.x}
        y={element.y}
        width={width}
        height={height}
        {...highlight}
        {...interaction}
      >
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          stroke="#cbd5e1"
          strokeWidth={2}
          fill="#f1f5f9"
          opacity={element.opacity ?? 1}
          listening={false}
        />
        <KonvaText
          x={0}
          y={height / 2 - 12}
          width={width}
          height={24}
          text="Image unavailable"
          fontSize={14}
          align="center"
          verticalAlign="middle"
          fill="#64748b"
          listening={false}
        />
      </Group>
    );
  }

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
      {...interaction}
    />
  ) : null;
};
