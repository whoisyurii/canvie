"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Group, Rect, Text as KonvaText, Image as KonvaImage } from "react-konva";
import type { CanvasElement } from "@/lib/store/useWhiteboardStore";
import { useWhiteboardStore } from "@/lib/store/useWhiteboardStore";
import { getColorWithOpacity } from "@/lib/color";
import { createObjectURLFromId } from "@/lib/files/storage";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist/types/src/display/api";

type HighlightProps = Record<string, unknown> | undefined;

interface FileElementProps {
  element: CanvasElement;
  highlight?: HighlightProps;
  interaction?: Record<string, any>;
}

type CachedPage = {
  canvas: HTMLCanvasElement;
  image: HTMLImageElement;
};

const clampPage = (page: number, maxPage?: number | null) => {
  if (!Number.isFinite(page)) {
    return 1;
  }
  const base = Math.max(1, Math.round(page));
  if (!maxPage || maxPage < 1) {
    return base;
  }
  return Math.min(base, maxPage);
};

export const FileElement = ({ element, highlight, interaction }: FileElementProps) => {
  const [thumbnail, setThumbnail] = useState<HTMLImageElement | null>(null);
  const [thumbnailError, setThumbnailError] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<HTMLImageElement | null>(null);
  const [isRenderingPdf, setIsRenderingPdf] = useState(false);
  const [pdfRenderError, setPdfRenderError] = useState(false);
  const [pdfPageCount, setPdfPageCount] = useState<number | null>(null);

  const collaboration = useWhiteboardStore((state) => state.collaboration);
  const setFileElementPage = useWhiteboardStore(
    (state) => state.setFileElementPage,
  );

  const pdfDocumentRef = useRef<PDFDocumentProxy | null>(null);
  const pdfLoadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const pdfRenderTaskRef = useRef<RenderTask | null>(null);
  const pdfObjectUrlRef = useRef<string | null>(null);
  const pdfPageCacheRef = useRef<Map<number, CachedPage>>(new Map());
  const isMountedRef = useRef(true);
  const latestPageRef = useRef<number>(element.pdfPage ?? 1);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const cleanupPdfResources = useCallback(
    (options?: { preserveState?: boolean }) => {
      pdfRenderTaskRef.current?.cancel();
      pdfRenderTaskRef.current = null;

      const loadingTask = pdfLoadingTaskRef.current;
      pdfLoadingTaskRef.current = null;
      if (loadingTask) {
        loadingTask.destroy().catch(() => undefined);
      }

      const pdfDocument = pdfDocumentRef.current;
      pdfDocumentRef.current = null;
      if (pdfDocument) {
        pdfDocument.cleanup().catch(() => undefined);
        const destroy = (
          pdfDocument as unknown as { destroy?: () => void }
        ).destroy;
        if (typeof destroy === "function") {
          try {
            destroy();
          } catch {
            // Ignore destroy errors from pdf.js cleanup.
          }
        }
      }

      const objectUrl = pdfObjectUrlRef.current;
      pdfObjectUrlRef.current = null;
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // Ignore revoke failures in non-browser environments.
        }
      }

      pdfPageCacheRef.current.clear();

      if (!options?.preserveState && isMountedRef.current) {
        setPdfPreview(null);
        setIsRenderingPdf(false);
        setPdfRenderError(false);
        setPdfPageCount(null);
      }
    },
    [],
  );

  useEffect(() => {
    return () => {
      cleanupPdfResources({ preserveState: true });
    };
  }, [cleanupPdfResources]);

  const elementWidth = element.width;
  const elementHeight = element.height;
  const elementFileUrl = element.fileUrl;
  const currentPdfPage = useMemo(
    () => Math.max(1, Math.round(element.pdfPage ?? 1)),
    [element.pdfPage],
  );

  useEffect(() => {
    latestPageRef.current = currentPdfPage;
  }, [currentPdfPage]);

  const renderPdfPage = useCallback(
    async (pageNumber: number, options?: { force?: boolean }) => {
      if (typeof window === "undefined") {
        return;
      }

      const pdfDocument = pdfDocumentRef.current;
      if (!pdfDocument) {
        return;
      }

      const maxPage = pdfPageCount ?? pdfDocument.numPages ?? null;
      const clampedPage = clampPage(pageNumber, maxPage);

      if (!options?.force) {
        const cached = pdfPageCacheRef.current.get(clampedPage);
        if (cached) {
          if (isMountedRef.current) {
            setPdfPreview(cached.image);
            setIsRenderingPdf(false);
            setPdfRenderError(false);
          }
          return;
        }
      }

      setIsRenderingPdf(true);
      setPdfRenderError(false);

      try {
        const page = await pdfDocument.getPage(clampedPage);
        const viewport = page.getViewport({ scale: 1 });

        const targetWidth = Math.max(
          Math.abs(elementWidth ?? viewport.width),
          1,
        );
        const targetHeight = Math.max(
          Math.abs(elementHeight ?? viewport.height),
          1,
        );
        const widthScale = viewport.width > 0 ? targetWidth / viewport.width : 1;
        const heightScale =
          viewport.height > 0 ? targetHeight / viewport.height : 1;
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

        const domDocument = window.document;
        if (
          typeof domDocument === "undefined" ||
          typeof domDocument.createElement !== "function"
        ) {
          throw new Error("Canvas rendering is not supported in this environment");
        }
        const canvas = domDocument.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Failed to acquire canvas context for PDF preview");
        }

        canvas.width = Math.max(1, Math.floor(scaledViewport.width));
        canvas.height = Math.max(1, Math.floor(scaledViewport.height));

        pdfRenderTaskRef.current?.cancel();
        const renderTask = page.render({
          canvasContext: context,
          viewport: scaledViewport,
        });
        pdfRenderTaskRef.current = renderTask;
        await renderTask.promise;

        const dataUrl = canvas.toDataURL("image/png");
        const image = new window.Image();
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("Failed to load PDF preview"));
          image.src = dataUrl;
        });

        page.cleanup();
        pdfRenderTaskRef.current = null;

        pdfPageCacheRef.current.set(clampedPage, { canvas, image });

        if (isMountedRef.current) {
          setPdfPreview(image);
          setIsRenderingPdf(false);
        }
      } catch (error) {
        pdfRenderTaskRef.current = null;
        if (!isMountedRef.current) {
          return;
        }
        console.error(
          `Failed to render PDF preview for ${elementFileUrl ?? "unknown"}`,
          error,
        );
        setPdfPreview(null);
        setPdfRenderError(true);
        setIsRenderingPdf(false);
      }
    },
    [elementFileUrl, elementHeight, elementWidth, pdfPageCount],
  );

  const renderPdfPageRef = useRef(renderPdfPage);
  useEffect(() => {
    renderPdfPageRef.current = renderPdfPage;
  }, [renderPdfPage]);

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
      cleanupPdfResources();
      return;
    }

    let cancelled = false;

    const loadPdfDocument = async () => {
      if (!element.fileUrl) {
        setPdfPreview(null);
        setPdfRenderError(true);
        setIsRenderingPdf(false);
        setPdfPageCount(null);
        return;
      }

      cleanupPdfResources({ preserveState: true });
      pdfPageCacheRef.current.clear();
      setPdfPreview(null);
      setPdfRenderError(false);
      setIsRenderingPdf(true);

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
          throw new Error("Unable to load PDF data for preview");
        }

        pdfObjectUrlRef.current = localUrl;

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

        const loadingTask = getDocument({ data: arrayBuffer });
        pdfLoadingTaskRef.current = loadingTask;
        const pdf = await loadingTask.promise;
        pdfLoadingTaskRef.current = null;

        if (cancelled) {
          await pdf.cleanup().catch(() => undefined);
          return;
        }

        pdfDocumentRef.current = pdf;
        const numPages = pdf.numPages ?? null;
        const resolvedCount = numPages && numPages > 0 ? numPages : null;
        setPdfPageCount(resolvedCount);

        const desiredPage = clampPage(latestPageRef.current, resolvedCount);
        if (desiredPage !== latestPageRef.current) {
          latestPageRef.current = desiredPage;
          setFileElementPage(element.id, desiredPage);
        }

        await renderPdfPageRef.current(desiredPage, { force: true });
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.error(
          `Failed to load PDF preview for ${element.fileUrl}`,
          error,
        );
        setPdfPreview(null);
        setPdfRenderError(true);
        setIsRenderingPdf(false);
      }
    };

    loadPdfDocument();

    return () => {
      cancelled = true;
    };
  }, [
    collaboration,
    cleanupPdfResources,
    element.fileType,
    element.fileUrl,
    element.id,
    setFileElementPage,
  ]);

  const dimensionSignature = useMemo(
    () =>
      [element.fileType ?? "", elementWidth ?? "auto", elementHeight ?? "auto"].join(
        "|",
      ),
    [element.fileType, elementHeight, elementWidth],
  );

  useEffect(() => {
    if (element.fileType !== "application/pdf") {
      return;
    }
    if (!pdfDocumentRef.current) {
      return;
    }
    pdfPageCacheRef.current.clear();
    void renderPdfPageRef.current(latestPageRef.current, { force: true });
  }, [dimensionSignature, element.fileType]);

  useEffect(() => {
    if (element.fileType !== "application/pdf") {
      return;
    }
    if (!pdfDocumentRef.current) {
      return;
    }
    void renderPdfPage(currentPdfPage);
  }, [currentPdfPage, element.fileType, renderPdfPage]);

  const width = element.width ?? 200;
  const height = element.height ?? 240;
  const padding = 12;
  const paginationHeight = 26;
  const paginationGap = 6;
  const nameTextHeight = 24;
  const previewHeight = Math.max(
    0,
    height - padding * 2 - paginationHeight - nameTextHeight - paginationGap * 2,
  );

  const cornerRadius = Math.min(8, Math.abs(width) / 2, Math.abs(height) / 2);
  const isPdf = element.fileType === "application/pdf";
  const previewImage = isPdf ? pdfPreview ?? thumbnail : thumbnail;
  const previewAreaWidth = Math.max(0, width - padding * 2);
  const previewAreaHeight = previewHeight;

  let imageX = padding;
  let imageY = padding;
  let imageWidth = previewAreaWidth;
  let imageHeight = previewAreaHeight;

  if (
    isPdf &&
    previewImage &&
    previewAreaWidth > 0 &&
    previewAreaHeight > 0
  ) {
    const sourceWidth = Math.max(
      1,
      previewImage.naturalWidth || previewImage.width || 0,
    );
    const sourceHeight = Math.max(
      1,
      previewImage.naturalHeight || previewImage.height || 0,
    );
    const widthScale = previewAreaWidth / sourceWidth;
    const heightScale = previewAreaHeight / sourceHeight;
    const scaleCandidates = [widthScale, heightScale].filter(
      (value) => Number.isFinite(value) && value > 0,
    );
    const scale =
      scaleCandidates.length > 0 ? Math.min(...scaleCandidates) : 1;

    imageWidth = Math.max(1, sourceWidth * scale);
    imageHeight = Math.max(1, sourceHeight * scale);
    const offsetX = (previewAreaWidth - imageWidth) / 2;
    const offsetY = (previewAreaHeight - imageHeight) / 2;
    imageX = padding + offsetX;
    imageY = padding + offsetY;
  }

  const placeholderText = isPdf
    ? isRenderingPdf
      ? "Rendering PDF..."
      : pdfRenderError
        ? "PDF preview unavailable"
        : "PDF"
    : thumbnailError
      ? "Preview unavailable"
      : (element.fileType ?? "FILE").slice(0, 8).toUpperCase();

  const paginationWidth = Math.max(0, width - padding * 2);
  const paginationX = padding;
  const paginationY = padding + previewHeight + paginationGap;
  const paginationSpacing = 8;
  const paginationButtonWidth = paginationHeight;
  const indicatorWidth = Math.max(
    0,
    paginationWidth - paginationButtonWidth * 2 - paginationSpacing * 2,
  );
  const indicatorX = paginationButtonWidth + paginationSpacing;
  const paginationTextOffset = Math.max(0, (paginationHeight - 16) / 2);
  const paginationLabelOffset = Math.max(0, (paginationHeight - 14) / 2);
  const paginationLabel = pdfPageCount
    ? `Page ${currentPdfPage} of ${pdfPageCount}`
    : `Page ${currentPdfPage}`;

  const nameY = Math.min(
    paginationY + paginationHeight + paginationGap,
    height - nameTextHeight - padding / 2,
  );

  const isPaginationInteractive = Boolean(
    isPdf && pdfPageCount && pdfPageCount > 0,
  );
  const previousDisabled = !isPaginationInteractive || currentPdfPage <= 1;
  const nextDisabled =
    !isPaginationInteractive || !pdfPageCount || currentPdfPage >= pdfPageCount;

  const handlePreviousPage = useCallback(() => {
    if (previousDisabled) {
      return;
    }
    const nextPage = Math.max(1, currentPdfPage - 1);
    if (nextPage === currentPdfPage) {
      return;
    }
    setFileElementPage(element.id, nextPage);
  }, [currentPdfPage, element.id, previousDisabled, setFileElementPage]);

  const handleNextPage = useCallback(() => {
    if (nextDisabled) {
      return;
    }
    const maxPage = pdfPageCount ?? currentPdfPage;
    const nextPage = Math.min(maxPage, currentPdfPage + 1);
    if (nextPage === currentPdfPage) {
      return;
    }
    setFileElementPage(element.id, nextPage);
  }, [currentPdfPage, element.id, nextDisabled, pdfPageCount, setFileElementPage]);

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
          x={imageX}
          y={imageY}
          width={imageWidth}
          height={imageHeight}
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
      {isPdf && (
        <Group
          name="pdf-pagination-controls"
          x={paginationX}
          y={paginationY}
          data-testid={`${element.id}-pagination`}
        >
          <Rect
            x={0}
            y={0}
            width={paginationWidth}
            height={paginationHeight}
            fill="rgba(15, 23, 42, 0.08)"
            cornerRadius={8}
            listening={false}
          />
          <Group
            name="pdf-pagination-prev"
            x={0}
            y={0}
            listening={!previousDisabled}
            onClick={handlePreviousPage}
            onTap={handlePreviousPage}
            opacity={previousDisabled ? 0.45 : 1}
            data-testid={`${element.id}-pagination-prev`}
          >
            <Rect
              x={0}
              y={0}
              width={paginationButtonWidth}
              height={paginationHeight}
              fill="rgba(255, 255, 255, 0.9)"
              cornerRadius={8}
              listening={false}
            />
            <KonvaText
              x={0}
              y={paginationTextOffset}
              width={paginationButtonWidth}
              height={paginationHeight}
              text="‹"
              fontSize={16}
              align="center"
              fill="#1f2937"
              listening={false}
            />
          </Group>
          <KonvaText
            name="pdf-pagination-label"
            x={indicatorX}
            y={paginationLabelOffset}
            width={indicatorWidth}
            height={paginationHeight}
            text={paginationLabel}
            fontSize={14}
            align="center"
            fill="#1f2937"
            listening={false}
          />
          <Group
            name="pdf-pagination-next"
            x={indicatorX + indicatorWidth + paginationSpacing}
            y={0}
            listening={!nextDisabled}
            onClick={handleNextPage}
            onTap={handleNextPage}
            opacity={nextDisabled ? 0.45 : 1}
            data-testid={`${element.id}-pagination-next`}
          >
            <Rect
              x={0}
              y={0}
              width={paginationButtonWidth}
              height={paginationHeight}
              fill="rgba(255, 255, 255, 0.9)"
              cornerRadius={8}
              listening={false}
            />
            <KonvaText
              x={0}
              y={paginationTextOffset}
              width={paginationButtonWidth}
              height={paginationHeight}
              text="›"
              fontSize={16}
              align="center"
              fill="#1f2937"
              listening={false}
            />
          </Group>
        </Group>
      )}
      <KonvaText
        x={padding}
        y={nameY}
        width={Math.max(0, width - padding * 2)}
        height={nameTextHeight}
        text={element.fileName ?? element.fileType ?? "Document"}
        fontSize={14}
        fill="#1f2937"
        ellipsis
        listening={false}
      />
    </Group>
  );
};
