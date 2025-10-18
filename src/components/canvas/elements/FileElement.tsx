"use client";

import { useEffect, useState } from "react";
import { Group, Rect, Text as KonvaText, Image as KonvaImage } from "react-konva";
import type { CanvasElement } from "@/lib/store/useWhiteboardStore";

type HighlightProps = Record<string, unknown> | undefined;

interface FileElementProps {
  element: CanvasElement;
  highlight?: HighlightProps;
  interaction?: Record<string, any>;
}

export const FileElement = ({ element, highlight, interaction }: FileElementProps) => {
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
        stroke={element.strokeColor}
        strokeWidth={element.strokeWidth}
        fill="white"
        opacity={element.opacity}
        cornerRadius={8}
        listening={false}
      />
      {thumbnail ? (
        <KonvaImage
          image={thumbnail}
          x={padding}
          y={padding}
          width={Math.max(0, width - padding * 2)}
          height={previewHeight}
          listening={false}
        />
      ) : (
        <KonvaText
          x={padding}
          y={padding}
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
        x={padding}
        y={height - 24 - padding / 2}
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
