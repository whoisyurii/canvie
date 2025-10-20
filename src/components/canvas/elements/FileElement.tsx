"use client";

import { useEffect, useState } from "react";
import { Group, Rect, Text as KonvaText, Image as KonvaImage } from "react-konva";
import type { CanvasElement } from "@/lib/store/useWhiteboardStore";
import { useWhiteboardStore } from "@/lib/store/useWhiteboardStore";
import { getColorWithOpacity } from "@/lib/color";
import { createObjectURLFromId } from "@/lib/files/storage";

type HighlightProps = Record<string, unknown> | undefined;

interface FileElementProps {
  element: CanvasElement;
  highlight?: HighlightProps;
  interaction?: Record<string, any>;
}

export const FileElement = ({ element, highlight, interaction }: FileElementProps) => {
  const [thumbnail, setThumbnail] = useState<HTMLImageElement | null>(null);
  const [thumbnailError, setThumbnailError] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<HTMLImageElement | null>(null);
  const [isRenderingPdf, setIsRenderingPdf] = useState(false);
  const [pdfRenderError, setPdfRenderError] = useState(false);
  const collaboration = useWhiteboardStore((state) => state.collaboration);

  useEffect(() => {
    if (!element.thumbnailUrl) {
      setThumbnail(null);
      return;
    }

    setThumbnailError(false);
    const img = new window.Image();
    img.src = element.thumbnailUrl;
    img.onload = () => setThumbnail(img);
    img.onerror = () => {
      console.warn(`Failed to load thumbnail: ${element.thumbnailUrl}`);
      setThumbnailError(true);
      setThumbnail(null);
    };

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [element.thumbnailUrl]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (element.fileType !== "application/pdf") {
      setPdfPreview(null);
      setPdfRenderError(false);
      setIsRenderingPdf(false);
      return;
    }

    let cancelled = false;
    let loadingTask: any | null = null;
    let objectUrl: string | null = null;

    const renderPdfPreview = async () => {
      if (!element.fileUrl) {
        setPdfPreview(null);
        setPdfRenderError(true);
        return;
      }

      setIsRenderingPdf(true);
      setPdfRenderError(false);

      let shouldResetRenderingState = true;

      try {
        let localUrl = await createObjectURLFromId(element.fileUrl);

        if (!localUrl && collaboration?.fileSyncManager) {
          const available = await collaboration.fileSyncManager.ensureFile(
            element.fileUrl,
          );
          if (available) {
            localUrl = await createObjectURLFromId(element.fileUrl);
          }
        }

        if (!localUrl) {
          shouldResetRenderingState = false;
          return;
        }

        objectUrl = localUrl;
        const response = await fetch(localUrl);
        const arrayBuffer = await response.arrayBuffer();

        const pdfjs = await import("pdfjs-dist");
        const { GlobalWorkerOptions, getDocument } = pdfjs;
        if (!GlobalWorkerOptions.workerSrc) {
          const workerModule = (await import(
            "pdfjs-dist/build/pdf.worker.min.mjs"
          )) as { default: string };
          GlobalWorkerOptions.workerSrc = workerModule.default;
        }

        loadingTask = getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);

        const viewport = page.getViewport({ scale: 1 });
        const targetWidth = Math.max(
          Math.abs(element.width ?? viewport.width),
          1,
        );
        const targetHeight = Math.max(
          Math.abs(element.height ?? viewport.height),
          1,
        );
        const widthScale = viewport.width > 0 ? targetWidth / viewport.width : 1;
        const heightScale = viewport.height > 0 ? targetHeight / viewport.height : 1;
        const scaleCandidates = [widthScale, heightScale].filter(
          (value) => Number.isFinite(value) && value > 0,
        );
        const baseScale =
          scaleCandidates.length > 0
            ? Math.max(Math.min(...scaleCandidates), 1)
            : 1;
        const deviceScale = Math.max(window.devicePixelRatio || 1, 1);
        const MAX_RENDER_DIMENSION = 2048 * deviceScale;

        let renderScale = baseScale * deviceScale;
        let scaledViewport = page.getViewport({ scale: renderScale });
        const maxDimension = Math.max(
          scaledViewport.width,
          scaledViewport.height,
        );

        if (maxDimension > MAX_RENDER_DIMENSION) {
          const reduction = MAX_RENDER_DIMENSION / maxDimension;
          renderScale *= reduction;
          scaledViewport = page.getViewport({ scale: renderScale });
        }

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Failed to acquire canvas context for PDF preview");
        }

        canvas.width = Math.max(1, Math.floor(scaledViewport.width));
        canvas.height = Math.max(1, Math.floor(scaledViewport.height));

        await page.render({ canvasContext: context, viewport: scaledViewport }).promise;

        if (cancelled) {
          return;
        }

        const dataUrl = canvas.toDataURL("image/png");
        const image = new window.Image();
        image.onload = () => {
          if (!cancelled) {
            setPdfPreview(image);
          }
        };
        image.onerror = () => {
          if (!cancelled) {
            setPdfPreview(null);
            setPdfRenderError(true);
          }
        };
        image.src = dataUrl;

        page.cleanup();
        pdf.cleanup();
        pdf.destroy();
      } catch (error) {
        if (!cancelled) {
          console.error(
            `Failed to render PDF preview for ${element.fileUrl}`,
            error,
          );
          setPdfPreview(null);
          setPdfRenderError(true);
        }
      } finally {
        if (!cancelled && shouldResetRenderingState) {
          setIsRenderingPdf(false);
        }

        if (loadingTask) {
          loadingTask.destroy();
          loadingTask = null;
        }

        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
        }
      }
    };

    renderPdfPreview();

    return () => {
      cancelled = true;

      if (loadingTask) {
        loadingTask.destroy();
        loadingTask = null;
      }

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    };
  }, [
    collaboration,
    element.fileType,
    element.fileUrl,
    element.height,
    element.width,
  ]);

  const width = element.width ?? 200;
  const height = element.height ?? 240;
  const padding = 12;
  const previewHeight = Math.max(0, height - padding * 2 - 32);

  // Calculate safe corner radius to prevent negative radius errors
  const cornerRadius = Math.min(
    8,
    Math.abs(width) / 2,
    Math.abs(height) / 2
  );

  const isPdf = element.fileType === "application/pdf";
  const previewImage = isPdf ? pdfPreview ?? thumbnail : thumbnail;
  const placeholderText = isPdf
    ? isRenderingPdf
      ? "Rendering PDF..."
      : pdfRenderError
        ? "PDF preview unavailable"
        : "PDF"
    : thumbnailError
      ? "Preview unavailable"
      : (element.fileType ?? "FILE").slice(0, 8).toUpperCase();

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
        stroke={getColorWithOpacity(element.strokeColor, element.strokeOpacity)}
        strokeWidth={element.strokeWidth}
        fill="white"
        opacity={element.opacity}
        cornerRadius={cornerRadius}
      />
      {previewImage ? (
        <KonvaImage
          image={previewImage}
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
          text={placeholderText}
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
