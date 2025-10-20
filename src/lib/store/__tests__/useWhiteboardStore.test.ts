import { beforeEach, describe, expect, it } from "vitest";

import {
  type CanvasElement,
  type SharedFile,
  useWhiteboardStore,
} from "@/lib/store/useWhiteboardStore";

describe("useWhiteboardStore file preview", () => {
  beforeEach(() => {
    useWhiteboardStore.setState({
      elements: [],
      uploadedFiles: [],
      filePreview: null,
    });
  });

  it("resolves metadata from shared files and canvas elements", () => {
    const sharedFile: SharedFile = {
      id: "file-1",
      name: "Shared Document.pdf",
      type: "application/pdf",
      url: "",
      ownerId: "user-1",
      ownerName: "User One",
      thumbnailUrl: "thumb.png",
    };

    const canvasElement: CanvasElement = {
      id: "file-1",
      type: "file",
      x: 0,
      y: 0,
      width: 240,
      height: 180,
      strokeColor: "#000000",
      strokeWidth: 2,
      strokeStyle: "solid",
      opacity: 1,
      fileUrl: "file-1",
      fileName: "Canvas Name.pdf",
      fileType: "application/pdf",
      thumbnailUrl: "element-thumb.png",
    };

    useWhiteboardStore.setState({
      uploadedFiles: [sharedFile],
      elements: [canvasElement],
    });

    useWhiteboardStore.getState().openFilePreview("file-1");
    const preview = useWhiteboardStore.getState().filePreview;

    expect(preview).toMatchObject({
      fileId: "file-1",
      name: "Shared Document.pdf",
      type: "application/pdf",
      ownerId: "user-1",
      ownerName: "User One",
      sourceElementId: "file-1",
      thumbnailUrl: "thumb.png",
    });

    useWhiteboardStore.getState().closeFilePreview();
    expect(useWhiteboardStore.getState().filePreview).toBeNull();
  });

  it("allows metadata overrides when opening previews", () => {
    useWhiteboardStore.getState().openFilePreview("file-2", {
      name: "Manual Override.pdf",
      type: "application/pdf",
      sourceElementId: "element-2",
    });

    const preview = useWhiteboardStore.getState().filePreview;

    expect(preview).toMatchObject({
      fileId: "file-2",
      name: "Manual Override.pdf",
      type: "application/pdf",
      sourceElementId: "element-2",
    });
  });
});

