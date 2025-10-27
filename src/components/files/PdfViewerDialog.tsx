"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWhiteboardStore } from "@/lib/store/useWhiteboardStore";
import { createObjectURLFromId } from "@/lib/files/storage";
import { useFileSync } from "@/hooks/useFileSync";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  RefreshCcw,
} from "lucide-react";
import {
  GlobalWorkerOptions,
  getDocument,
  version as pdfjsVersion,
} from "pdfjs-dist";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist/types/src/display/api";

let workerConfigured = false;

const configurePdfWorker = () => {
  if (workerConfigured || typeof window === "undefined") {
    return;
  }

  try {
    let version: string | null = null;

    const candidate = typeof pdfjsVersion === "string" ? pdfjsVersion : null;
    if (candidate && candidate.length > 0) {
      version = candidate;
    }

    if (!version) {
      workerConfigured = true;
      return;
    }

    const workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`;
    GlobalWorkerOptions.workerSrc = workerSrc;
    workerConfigured = true;
  } catch (error) {
    console.error("Failed to configure pdf.js worker", error);
  }
};

type ViewerStatus = "idle" | "loading" | "ready" | "error";

export const PdfViewerDialog = () => {
  const filePreview = useWhiteboardStore((state) => state.filePreview);
  const closeFilePreview = useWhiteboardStore((state) => state.closeFilePreview);
  const setFileElementPage = useWhiteboardStore(
    (state) => state.setFileElementPage,
  );
  const fileSyncManager = useWhiteboardStore(
    (state) => state.collaboration?.fileSyncManager ?? null
  );
  const { ensureFile } = useFileSync(fileSyncManager);

  const [status, setStatus] = useState<ViewerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [documentProxy, setDocumentProxy] = useState<PDFDocumentProxy | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const documentRef = useRef<PDFDocumentProxy | null>(null);

  useEffect(() => {
    configurePdfWorker();
  }, []);

  const updateObjectUrl = useCallback((next: string | null) => {
    setObjectUrl((current) => {
      if (current && current !== next) {
        try {
          URL.revokeObjectURL(current);
        } catch (revokeError) {
          console.error("Failed to revoke object URL", revokeError);
        }
      }
      return next ?? null;
    });
  }, []);

  useEffect(() => {
    return () => {
      updateObjectUrl(null);
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      const loadingTask = loadingTaskRef.current;
      loadingTaskRef.current = null;
      if (loadingTask) {
        loadingTask.destroy().catch(() => undefined);
      }
      const activeDoc = documentRef.current;
      documentRef.current = null;
      if (activeDoc) {
        activeDoc.cleanup().catch(() => undefined);
      }
    };
  }, [updateObjectUrl]);

  useEffect(() => {
    if (!filePreview) {
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      const loadingTask = loadingTaskRef.current;
      loadingTaskRef.current = null;
      if (loadingTask) {
        loadingTask.destroy().catch(() => undefined);
      }
      const activeDoc = documentRef.current;
      documentRef.current = null;
      if (activeDoc) {
        activeDoc.cleanup().catch(() => undefined);
      }
      updateObjectUrl(null);
      setDocumentProxy(null);
      setStatus("idle");
      setError(null);
      setPageCount(0);
      setCurrentPage(1);
      setIsRendering(false);
      setRetryToken(0);
      return;
    }

    const initialPage = Math.max(
      1,
      Math.round(filePreview.initialPage ?? 1),
    );
    let cancelled = false;
    setStatus("loading");
    setError(null);
    setIsRendering(false);
    setPageCount(0);
    setCurrentPage(initialPage);

    const loadDocument = async () => {
      try {
        await ensureFile(filePreview.fileId);
        const url = await createObjectURLFromId(filePreview.fileId);
        if (!url) {
          throw new Error("Unable to locate the PDF data for preview.");
        }
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }

        updateObjectUrl(url);
        const loadingTask = getDocument(url);
        loadingTaskRef.current = loadingTask;
        const loadedDoc = await loadingTask.promise;
        if (cancelled) {
          await loadingTask.destroy().catch(() => undefined);
          return;
        }

        documentRef.current?.cleanup().catch(() => undefined);
        documentRef.current = loadedDoc;
        setDocumentProxy(loadedDoc);
        setPageCount(loadedDoc.numPages ?? 0);
        setStatus("ready");
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        console.error(loadError);
        setDocumentProxy(null);
        setPageCount(0);
        setIsRendering(false);
        updateObjectUrl(null);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load PDF preview."
        );
        setStatus("error");
      }
    };

    loadDocument();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      const loadingTask = loadingTaskRef.current;
      loadingTaskRef.current = null;
      if (loadingTask) {
        loadingTask.destroy().catch(() => undefined);
      }
      const activeDoc = documentRef.current;
      documentRef.current = null;
      if (activeDoc) {
        activeDoc.cleanup().catch(() => undefined);
      }
      setDocumentProxy(null);
      updateObjectUrl(null);
    };
  }, [ensureFile, filePreview, retryToken, updateObjectUrl]);

  useEffect(() => {
    if (!documentProxy || !filePreview) {
      return;
    }

    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      setError("Unable to render the PDF preview in this browser.");
      setStatus("error");
      return;
    }

    const renderPage = async () => {
      try {
        setIsRendering(true);
        const page = await documentProxy.getPage(currentPage);
        if (cancelled) {
          return;
        }

        const viewport = page.getViewport({ scale: 1.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        renderTaskRef.current?.cancel();
        const renderTask = page.render({ canvasContext: context, viewport });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        if (!cancelled) {
          setIsRendering(false);
        }
      } catch (pageError) {
        if (cancelled) {
          return;
        }
        console.error(pageError);
        setError(
          pageError instanceof Error
            ? pageError.message
            : "Failed to render the PDF page."
        );
        setStatus("error");
        setIsRendering(false);
      }
    };

    renderPage();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [documentProxy, currentPage, filePreview]);

  const handleClose = useCallback(() => {
    closeFilePreview();
  }, [closeFilePreview]);

  const handlePrevious = useCallback(() => {
    if (status !== "ready" || currentPage <= 1) {
      return;
    }
    setCurrentPage((page) => Math.max(1, page - 1));
  }, [currentPage, status]);

  const handleNext = useCallback(() => {
    if (status !== "ready" || pageCount === 0 || currentPage >= pageCount) {
      return;
    }
    setCurrentPage((page) => Math.min(pageCount, page + 1));
  }, [currentPage, pageCount, status]);

  const handleRetry = useCallback(() => {
    setRetryToken((token) => token + 1);
    setError(null);
  }, []);

  const handleOpenInNewTab = useCallback(() => {
    if (!objectUrl) {
      return;
    }
    window.open(objectUrl, "_blank", "noopener,noreferrer");
  }, [objectUrl]);

  useEffect(() => {
    if (status !== "ready" || pageCount <= 0) {
      return;
    }
    setCurrentPage((page) => {
      const safePage = Math.min(Math.max(page, 1), pageCount);
      return safePage === page ? page : safePage;
    });
  }, [pageCount, status]);

  useEffect(() => {
    if (status !== "ready") {
      return;
    }
    const sourceElementId = filePreview?.sourceElementId;
    if (!sourceElementId) {
      return;
    }
    const safePage = Math.max(1, Math.round(currentPage));
    setFileElementPage(sourceElementId, safePage);
  }, [currentPage, filePreview?.sourceElementId, setFileElementPage, status]);

  const isFirstPage = currentPage <= 1;
  const isLastPage = pageCount > 0 && currentPage >= pageCount;
  const canNavigate = status === "ready" && pageCount > 0;

  const dialogTitle = filePreview?.name ?? "File preview";
  const dialogDescription = useMemo(() => {
    const typeLabel = filePreview?.type
      ? filePreview.type.toUpperCase()
      : "PDF";
    return `${typeLabel} · Use the controls below to navigate between pages.`;
  }, [filePreview?.type]);

  return (
    <Dialog open={Boolean(filePreview)} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenInNewTab}
              disabled={!objectUrl || status !== "ready"}
            >
              <ExternalLink className="mr-2 h-4 w-4" /> Open in new tab
            </Button>
          </div>

          <div className="flex flex-col items-center gap-6">
            <div className="relative flex min-h-[320px] w-full items-center justify-center overflow-auto rounded-md border bg-muted/40 p-4">
              <canvas
                ref={canvasRef}
                className={cn(
                  "max-h-[70vh] w-full max-w-full rounded border bg-white shadow-sm",
                  status === "error" ? "hidden" : "block"
              )}
            />

              {status === "error" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                  <p className="text-sm font-medium text-destructive">
                    {error ?? "Unable to load PDF preview."}
                  </p>
                  <Button variant="outline" size="sm" onClick={handleRetry}>
                    <RefreshCcw className="mr-2 h-4 w-4" /> Try again
                  </Button>
                </div>
              ) : null}

              {status !== "error" && (status === "loading" || isRendering) ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 pointer-events-none">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Loading PDF…</p>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevious}
                  disabled={!canNavigate || isFirstPage}
                >
                  <ChevronLeft className="mr-2 h-4 w-4" /> Previous
                </Button>
                <p className="text-sm text-muted-foreground">
                  {pageCount > 0 ? `Page ${currentPage} of ${pageCount}` : "Preparing preview…"}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNext}
                  disabled={!canNavigate || isLastPage}
                >
                  Next <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

