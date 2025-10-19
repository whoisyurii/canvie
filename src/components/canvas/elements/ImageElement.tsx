"use client";

import { useEffect, useState } from "react";
import { Group, Rect, Text as KonvaText, Image as KonvaImage } from "react-konva";
import type { CanvasElement } from "@/lib/store/useWhiteboardStore";
import { useWhiteboardStore } from "@/lib/store/useWhiteboardStore";
import { createObjectURLFromId } from "@/lib/files/storage";

type HighlightProps = Record<string, unknown> | undefined;

interface ImageElementProps {
  element: CanvasElement;
  highlight?: HighlightProps;
  interaction?: Record<string, any>;
}

export const ImageElement = ({ element, highlight, interaction }: ImageElementProps) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [hasError, setHasError] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const collaboration = useWhiteboardStore((state) => state.collaboration);

  useEffect(() => {
    if (!element.fileUrl) return;

    const fileId = element.fileUrl; // fileUrl now stores the file ID
    setHasError(false);
    setIsDownloading(false);

    const loadImage = async () => {
      try {
        // Try to load from IndexedDB
        const objectURL = await createObjectURLFromId(fileId);

        if (objectURL) {
          // File is available locally
          const img = new window.Image();
          img.src = objectURL;
          img.onload = () => setImage(img);
          img.onerror = () => {
            URL.revokeObjectURL(objectURL);
            setHasError(true);
            setImage(null);
          };
        } else {
          // File not available, need to request from peers
          setIsDownloading(true);

          if (collaboration?.fileSyncManager) {
            const available = await collaboration.fileSyncManager.ensureFile(fileId);
            if (available) {
              // File was immediately available (shouldn't happen, but handle it)
              const url = await createObjectURLFromId(fileId);
              if (url) {
                const img = new window.Image();
                img.src = url;
                img.onload = () => {
                  setImage(img);
                  setIsDownloading(false);
                };
                img.onerror = () => {
                  URL.revokeObjectURL(url);
                  setHasError(true);
                  setImage(null);
                  setIsDownloading(false);
                };
              }
            }
            // Otherwise, download is in progress and will trigger re-render when complete
          } else {
            // No file sync manager, show error
            setHasError(true);
            setIsDownloading(false);
          }
        }
      } catch (error) {
        console.error(`Failed to load image ${fileId}:`, error);
        setHasError(true);
        setImage(null);
        setIsDownloading(false);
      }
    };

    loadImage();

    return () => {
      // Cleanup would go here if needed
    };
  }, [element.fileUrl, collaboration]);

  const width = element.width ?? 200;
  const height = element.height ?? 200;

  // Show downloading state
  if (isDownloading) {
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
          stroke="#3b82f6"
          strokeWidth={2}
          fill="#eff6ff"
          opacity={element.opacity ?? 1}
          listening={false}
        />
        <KonvaText
          x={0}
          y={height / 2 - 12}
          width={width}
          height={24}
          text="Downloading..."
          fontSize={14}
          align="center"
          verticalAlign="middle"
          fill="#3b82f6"
          listening={false}
        />
      </Group>
    );
  }

  // Show placeholder if image failed to load (e.g., invalid blob URL from collaborator)
  if (hasError) {
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
