const clampScale = (width: number, height: number, maxSize: number) => {
  const longest = Math.max(width, height);
  if (longest <= maxSize) {
    return 1;
  }
  return maxSize / longest;
};

export const generateFilePreview = async (
  file: File,
  existingUrl?: string,
): Promise<string | undefined> => {
  if (typeof window === "undefined") {
    return undefined;
  }

  if (file.type.startsWith("image/")) {
    return existingUrl ?? URL.createObjectURL(file);
  }

  if (file.type === "application/pdf") {
    const arrayBuffer = await file.arrayBuffer();
    const pdfjs = await import("pdfjs-dist");
    const { GlobalWorkerOptions, getDocument } = pdfjs;
    if (!GlobalWorkerOptions.workerSrc) {
      GlobalWorkerOptions.workerSrc = new URL(
        "pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
    }

    const loadingTask = getDocument({ data: arrayBuffer });
    try {
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const scale = clampScale(viewport.width, viewport.height, 160);
      const scaledViewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) {
        return undefined;
      }
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      await page.render({ canvasContext: context, viewport: scaledViewport }).promise;
      return canvas.toDataURL("image/png");
    } finally {
      loadingTask.destroy();
    }
  }

  return undefined;
};
