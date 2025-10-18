"use client";

import { useEffect, useState } from "react";
import { Image as KonvaImage } from "react-konva";
import type { CanvasElement } from "@/lib/store/useWhiteboardStore";

type HighlightProps = Record<string, unknown> | undefined;

interface ImageElementProps {
  element: CanvasElement;
  highlight?: HighlightProps;
  interaction?: Record<string, any>;
}

export const ImageElement = ({ element, highlight, interaction }: ImageElementProps) => {
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
      {...interaction}
    />
  ) : null;
};
