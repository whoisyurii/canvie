import React, { act } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

type MockImageEvent = { type: "load" | "error" };

class MockImage {
  onload: ((event: MockImageEvent) => void) | null = null;
  onerror: ((event: MockImageEvent) => void) | null = null;
  naturalWidth = 600;
  naturalHeight = 800;
  width = 600;
  height = 800;
  private _src: string | null = "";

  set src(value: string) {
    this._src = value;
    const payload = value ?? "";
    queueMicrotask(() => {
      if (typeof payload === "string" && payload.includes("fail")) {
        this.onerror?.({ type: "error" });
      } else {
        this.onload?.({ type: "load" });
      }
    });
  }

  get src() {
    return this._src;
  }
}

const createObjectURLMock = vi.hoisted(() => vi.fn(async () => "blob:mock-pdf"));

const pdfMocks = vi.hoisted(() => {
  const mocks: {
    getPage: ReturnType<typeof vi.fn>;
    cleanup: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    getDocument: ReturnType<typeof vi.fn>;
  } = {
    getPage: vi.fn(async () => ({
      getViewport: () => ({ width: 600, height: 800 }),
      render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
      cleanup: vi.fn(() => undefined),
    })),
    cleanup: vi.fn(() => Promise.resolve()),
    destroy: vi.fn(() => Promise.resolve()),
    getDocument: vi.fn(),
  };

  mocks.getDocument.mockImplementation(() => ({
    promise: Promise.resolve({
      numPages: 5,
      getPage: mocks.getPage,
      cleanup: mocks.cleanup,
      destroy: mocks.destroy,
    }),
    destroy: mocks.destroy,
  }));

  return mocks;
});

vi.mock("canvas", () => {
  const noop = () => undefined;
  const createCanvas = () => ({
    width: 300,
    height: 150,
    getContext: () => ({
      fillRect: noop,
      clearRect: noop,
      getImageData: () => ({ data: [] }),
      putImageData: noop,
      createImageData: () => ({}),
      setTransform: noop,
      drawImage: noop,
      save: noop,
      restore: noop,
      beginPath: noop,
      closePath: noop,
      moveTo: noop,
      lineTo: noop,
      clip: noop,
      stroke: noop,
      translate: noop,
      scale: noop,
      rotate: noop,
      arc: noop,
      fill: noop,
      measureText: () => ({ width: 0 }),
      transform: noop,
      rect: noop,
      quadraticCurveTo: noop,
      createLinearGradient: () => ({ addColorStop: noop }),
      setLineDash: noop,
    }),
    style: {},
  });

  const moduleExports = {
    DOMMatrix: class {},
    Path2D: class {},
    Image: MockImage,
    CanvasGradient: class {},
    CanvasPattern: class {},
    createCanvas,
  };

  return {
    __esModule: true,
    default: moduleExports,
    ...moduleExports,
  };
});

vi.mock("react-konva", () => {
  const createComponent = (tag: string) =>
    React.forwardRef<any, any>((props, ref) => {
      const {
        children,
        text,
        cornerRadius: _cornerRadius,
        listening: _listening,
        onTap: _onTap,
        ellipsis: _ellipsis,
        ...rest
      } = props;

      const content =
        children ?? (typeof text === "string" || typeof text === "number"
          ? text
          : undefined);

      return React.createElement(tag, { ref, ...rest }, content);
    });

  return {
    __esModule: true,
    Stage: createComponent("div"),
    Layer: createComponent("div"),
    Group: createComponent("div"),
    Rect: createComponent("div"),
    Text: createComponent("div"),
    Image: createComponent("div"),
  };
});

vi.mock("@/lib/files/storage", () => ({
  createObjectURLFromId: createObjectURLMock,
}));

vi.mock("pdfjs-dist/build/pdf.worker.min.mjs", () => ({
  default: "mock-worker.js",
}));

vi.mock("pdfjs-dist", () => ({
  getDocument: (...args: unknown[]) => pdfMocks.getDocument(...args),
  GlobalWorkerOptions: { workerSrc: "" },
}));

import { FileElement } from "@/components/canvas/elements/FileElement";
import { useWhiteboardStore } from "@/lib/store/useWhiteboardStore";

const fetchMock = vi.fn(async () => ({
  arrayBuffer: async () => new ArrayBuffer(8),
}));

let originalFetch: typeof fetch;
let OriginalImage: typeof Image;
let originalToDataURL: typeof HTMLCanvasElement.prototype.toDataURL;
beforeAll(() => {
  originalFetch = global.fetch;
  (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  OriginalImage = window.Image;
  (window as unknown as { Image: typeof Image }).Image = MockImage as unknown as typeof Image;
  originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", {
    configurable: true,
    value: vi.fn(() => "data:image/png;base64,MOCK"),
  });
  Object.defineProperty(window, "devicePixelRatio", {
    configurable: true,
    value: 1,
  });
});

afterAll(() => {
  (global as unknown as { fetch: typeof fetch }).fetch = originalFetch;
  (window as unknown as { Image: typeof Image }).Image = OriginalImage;
  Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", {
    configurable: true,
    value: originalToDataURL,
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  useWhiteboardStore.setState({
    elements: [],
    collaboration: null,
  });
});

afterEach(() => {
  cleanup();
});

const TestStage = () => {
  const element = useWhiteboardStore((state) => state.elements[0]);
  if (!element) {
    return null;
  }
  return <FileElement element={element} />;
};

describe("FileElement", () => {
  it("updates stored page and caches rendered canvases", async () => {
    useWhiteboardStore.setState({
      elements: [
        {
          id: "file-1",
          type: "file",
          x: 0,
          y: 0,
          width: 260,
          height: 320,
          strokeColor: "#000000",
          strokeOpacity: 1,
          strokeWidth: 2,
          strokeStyle: "solid",
          opacity: 1,
          fileUrl: "file-1",
          fileType: "application/pdf",
          pdfPage: 1,
        },
      ],
    });

    const user = userEvent.setup();
    render(<TestStage />);

    await waitFor(() => expect(pdfMocks.getDocument).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(pdfMocks.getPage).toHaveBeenCalledWith(1));
    await screen.findByText("Page 1 of 5");

    const nextControl = await screen.findByTestId("file-1-pagination-next");
    const prevControl = await screen.findByTestId("file-1-pagination-prev");

    await user.click(nextControl);

    await waitFor(() =>
      expect(useWhiteboardStore.getState().elements[0].pdfPage).toBe(2)
    );
    expect(pdfMocks.getPage).toHaveBeenCalledWith(2);

    await user.click(prevControl);

    await waitFor(() =>
      expect(useWhiteboardStore.getState().elements[0].pdfPage).toBe(1)
    );

    await user.click(nextControl);

    await waitFor(() =>
      expect(useWhiteboardStore.getState().elements[0].pdfPage).toBe(2)
    );

    expect(pdfMocks.getPage).toHaveBeenCalledTimes(2);
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("respects the stored page when remounting", async () => {
    useWhiteboardStore.setState({
      elements: [
        {
          id: "file-2",
          type: "file",
          x: 0,
          y: 0,
          width: 220,
          height: 280,
          strokeColor: "#000000",
          strokeOpacity: 1,
          strokeWidth: 2,
          strokeStyle: "solid",
          opacity: 1,
          fileUrl: "file-2",
          fileType: "application/pdf",
          pdfPage: 3,
        },
      ],
    });

    const firstRender = render(<TestStage />);

    await waitFor(() => expect(pdfMocks.getPage).toHaveBeenCalledWith(3));

    act(() => {
      useWhiteboardStore.getState().setFileElementPage("file-2", 4);
    });
    await waitFor(() =>
      expect(useWhiteboardStore.getState().elements[0].pdfPage).toBe(4)
    );

    firstRender.unmount();
    pdfMocks.getDocument.mockClear();
    pdfMocks.getPage.mockClear();
    createObjectURLMock.mockClear();
    fetchMock.mockClear();

    const secondRender = render(<TestStage />);

    await waitFor(() => expect(pdfMocks.getDocument).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(pdfMocks.getPage).toHaveBeenCalledWith(4));
    await waitFor(() =>
      expect(useWhiteboardStore.getState().elements[0].pdfPage).toBe(4)
    );

    secondRender.unmount();
  });
});
