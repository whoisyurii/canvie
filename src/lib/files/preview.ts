const clampScale = (width: number, height: number, maxSize: number) => {
  const longest = Math.max(width, height);
  if (longest <= maxSize) {
    return 1;
  }
  return maxSize / longest;
};

const createIconThumbnail = (
  label: string,
  accent: string,
  bodyLines: string[] = [],
): string | undefined => {
  const canvas = document.createElement("canvas");
  canvas.width = 200;
  canvas.height = 260;
  const context = canvas.getContext("2d");
  if (!context) {
    return undefined;
  }

  context.fillStyle = "#f8fafc";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = accent;
  context.fillRect(0, 0, canvas.width, 56);

  context.fillStyle = "white";
  context.font = "bold 28px Inter, sans-serif";
  context.textBaseline = "middle";
  context.fillText(label, 20, 28);

  context.fillStyle = "#1f2937";
  context.font = "16px Inter, sans-serif";
  context.textBaseline = "top";
  const lineHeight = 22;
  const maxWidth = canvas.width - 32;
  let y = 72;
  bodyLines.forEach((line) => {
    context.fillText(line, 16, y, maxWidth);
    y += lineHeight;
  });

  return canvas.toDataURL("image/png");
};

const createTextPreview = async (file: File): Promise<string | undefined> => {
  const textContent = await file.text();
  const sanitized = textContent.replace(/\s+/g, " ").trim();
  if (!sanitized) {
    return createIconThumbnail("TXT", "#1d4ed8");
  }

  const words = sanitized.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const tentative = currentLine ? `${currentLine} ${word}` : word;
    if (tentative.length > 28) {
      lines.push(currentLine);
      currentLine = word;
      if (lines.length >= 5) {
        break;
      }
    } else {
      currentLine = tentative;
    }
  }
  if (lines.length < 5 && currentLine) {
    lines.push(currentLine);
  }

  if (lines.length === 0) {
    lines.push(sanitized.slice(0, 28));
  }

  return createIconThumbnail("TXT", "#1d4ed8", lines.slice(0, 5));
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
      const workerModule = (await import("pdfjs-dist/build/pdf.worker.min.mjs")) as {
        default: string;
      };
      GlobalWorkerOptions.workerSrc = workerModule.default;
    }

    const loadingTask = getDocument({ data: arrayBuffer });
    try {
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const MAX_PREVIEW_SIZE = 960;
      const MAX_DPR = 2;
      const devicePixelRatio = Math.min(
        MAX_DPR,
        typeof window !== "undefined" && window.devicePixelRatio
          ? window.devicePixelRatio
          : 1,
      );
      const scale = clampScale(viewport.width, viewport.height, MAX_PREVIEW_SIZE);
      const scaledViewport = page.getViewport({ scale: scale * devicePixelRatio });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) {
        return createIconThumbnail("PDF", "#e03131");
      }
      canvas.width = Math.ceil(scaledViewport.width);
      canvas.height = Math.ceil(scaledViewport.height);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.imageSmoothingQuality = "high";
      await page.render({ canvasContext: context, viewport: scaledViewport }).promise;
      return canvas.toDataURL("image/png");
    } catch (error) {
      console.error("Failed to render PDF preview", error);
      return createIconThumbnail("PDF", "#e03131");
    } finally {
      loadingTask.destroy();
    }
  }

  if (file.type === "text/plain") {
    return createTextPreview(file);
  }

  return undefined;
};
