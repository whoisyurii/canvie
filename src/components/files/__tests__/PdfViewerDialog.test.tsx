import React, { act } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PdfViewerDialog } from "@/components/files/PdfViewerDialog";
import { useWhiteboardStore } from "@/lib/store/useWhiteboardStore";

const ensureFileMock = vi.fn(async () => true);

vi.mock("@/hooks/useFileSync", () => ({
  useFileSync: () => ({
    ensureFile: ensureFileMock,
  }),
}));

vi.mock("@/lib/files/storage", () => ({
  createObjectURLFromId: async () => "blob:mock-pdf",
}));

const pdfMocks = {
  getPage: vi.fn(async () => ({
    getViewport: () => ({ width: 600, height: 800 }),
    render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
  })),
  cleanup: vi.fn(() => Promise.resolve()),
  destroy: vi.fn(() => Promise.resolve()),
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 3,
      getPage: pdfMocks.getPage,
      cleanup: pdfMocks.cleanup,
    }),
    destroy: pdfMocks.destroy,
  })),
};

vi.mock("pdfjs-dist", () => ({
  getDocument: (...args: unknown[]) => pdfMocks.getDocument(...args),
  GlobalWorkerOptions: { workerSrc: "" },
  version: "4.10.38",
}));

describe("PdfViewerDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pdfMocks.getPage.mockClear();
    pdfMocks.getDocument.mockClear();
    pdfMocks.cleanup.mockClear();
    pdfMocks.destroy.mockClear();
    useWhiteboardStore.setState({
      filePreview: null,
      uploadedFiles: [],
      elements: [],
    });
  });

  it("loads a PDF and supports multi-page navigation", async () => {
    const user = userEvent.setup();
    render(<PdfViewerDialog />);

    act(() => {
      useWhiteboardStore.setState({
        elements: [
          {
            id: "file-1",
            type: "file",
            x: 0,
            y: 0,
            width: 200,
            height: 240,
            strokeColor: "#000000",
            strokeOpacity: 1,
            strokeWidth: 2,
            strokeStyle: "solid",
            opacity: 1,
            fileUrl: "file-1",
            fileType: "application/pdf",
            pdfPage: 2,
          },
        ],
      });
      useWhiteboardStore.getState().openFilePreview("file-1", {
        name: "Preview.pdf",
        type: "application/pdf",
        sourceElementId: "file-1",
        initialPage: 2,
      });
    });

    await screen.findByText("Preparing preview…");
    await screen.findByText("Page 2 of 3");

    expect(ensureFileMock).toHaveBeenCalledWith("file-1");
    expect(pdfMocks.getDocument).toHaveBeenCalledTimes(1);
    expect(pdfMocks.getPage).toHaveBeenCalledWith(2);

    const previousButton = screen.getByRole("button", { name: /Previous/i });
    const nextButton = screen.getByRole("button", { name: /Next/i });

    await waitFor(() =>
      expect(useWhiteboardStore.getState().elements[0].pdfPage).toBe(2)
    );
    expect(previousButton).not.toBeDisabled();
    expect(nextButton).not.toBeDisabled();

    await user.click(nextButton);
    await waitFor(() =>
      expect(screen.getByText("Page 3 of 3")).toBeInTheDocument()
    );
    expect(pdfMocks.getPage).toHaveBeenCalledWith(3);
    await waitFor(() =>
      expect(useWhiteboardStore.getState().elements[0].pdfPage).toBe(3)
    );
    expect(nextButton).toBeDisabled();

    await user.click(previousButton);
    await waitFor(() =>
      expect(screen.getByText("Page 2 of 3")).toBeInTheDocument()
    );
    await waitFor(() =>
      expect(useWhiteboardStore.getState().elements[0].pdfPage).toBe(2)
    );
  });
});

