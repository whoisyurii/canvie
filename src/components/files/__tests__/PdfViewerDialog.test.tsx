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
      useWhiteboardStore.getState().openFilePreview("file-1", {
        name: "Preview.pdf",
        type: "application/pdf",
      });
    });

    await screen.findByText("Preparing preview…");
    await screen.findByText("Page 1 of 3");

    expect(ensureFileMock).toHaveBeenCalledWith("file-1");
    expect(pdfMocks.getDocument).toHaveBeenCalledTimes(1);
    expect(pdfMocks.getPage).toHaveBeenCalledWith(1);

    const previousButton = screen.getByRole("button", { name: /Previous/i });
    const nextButton = screen.getByRole("button", { name: /Next/i });

    expect(previousButton).toBeDisabled();
    expect(nextButton).not.toBeDisabled();

    await user.click(nextButton);
    await waitFor(() => expect(screen.getByText("Page 2 of 3")).toBeInTheDocument());
    expect(pdfMocks.getPage).toHaveBeenCalledWith(2);

    await user.click(nextButton);
    await waitFor(() => expect(screen.getByText("Page 3 of 3")).toBeInTheDocument());
    expect(pdfMocks.getPage).toHaveBeenCalledWith(3);
    expect(nextButton).toBeDisabled();

    await user.click(previousButton);
    await waitFor(() => expect(screen.getByText("Page 2 of 3")).toBeInTheDocument());
    expect(previousButton).not.toBeDisabled();
  });
});

