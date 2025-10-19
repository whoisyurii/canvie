import type { Awareness } from "y-protocols/awareness";
import type { WebrtcProvider } from "y-webrtc";
import { FileTransferManager, type FileTransferMessage } from "./fileTransfer";
import { getAllFileIds, hasFile } from "../files/storage";

interface FileSyncCallbacks {
  onFileAvailable?: (fileId: string) => void;
  onFileDownloadStart?: (fileId: string) => void;
  onFileDownloadProgress?: (fileId: string, progress: number, total: number) => void;
  onFileDownloadComplete?: (fileId: string) => void;
  onFileDownloadError?: (fileId: string, error: string) => void;
}

interface PeerFileState {
  hasFiles: string[];
  lastUpdate: number;
}

/**
 * File sync coordinator - orchestrates file sharing between peers
 */
export class FileSyncManager {
  private awareness: Awareness;
  private provider: WebrtcProvider;
  private transferManager: FileTransferManager;
  private callbacks: FileSyncCallbacks;
  private peerFiles = new Map<string, PeerFileState>();
  private pendingRequests = new Set<string>();
  private awarenessHandler: ((changed: { added: number[]; updated: number[]; removed: number[] }) => void) | null = null;

  constructor(
    awareness: Awareness,
    provider: WebrtcProvider,
    callbacks: FileSyncCallbacks = {}
  ) {
    this.awareness = awareness;
    this.provider = provider;
    this.callbacks = callbacks;
    this.transferManager = new FileTransferManager(awareness);

    this.init();
  }

  /**
   * Initialize file sync
   */
  private init(): void {
    // Set up transfer manager message handler
    this.transferManager.setMessageHandler((message, toPeer) => {
      this.broadcastMessage(message, toPeer);
    });

    // Listen for awareness changes (peer file lists)
    this.awarenessHandler = (changed) => {
      this.handleAwarenessChange(changed);
    };
    this.awareness.on("change", this.awarenessHandler);

    // Listen for WebRTC messages
    this.provider.on("peers", () => {
      // When peer list changes, update our file list in awareness
      this.updateLocalFileList();
    });

    // Initial file list broadcast
    this.updateLocalFileList();
  }

  /**
   * Update awareness with files we have
   */
  private async updateLocalFileList(): Promise<void> {
    const fileIds = await getAllFileIds();

    const currentState = this.awareness.getLocalState() as any;
    this.awareness.setLocalState({
      ...currentState,
      hasFiles: fileIds,
      filesUpdated: Date.now(),
    });
  }

  /**
   * Public hook to notify the manager that we've added a new local file.
   * This simply refreshes our awareness state so peers learn about it.
   */
  async notifyLocalFileAdded(fileId: string): Promise<void> {
    void fileId; // fileId may be useful for future optimizations
    await this.updateLocalFileList();
  }

  /**
   * Handle awareness changes from peers
   */
  private handleAwarenessChange(changed: {
    added: number[];
    updated: number[];
    removed: number[];
  }): void {
    const allChanged = [...changed.added, ...changed.updated];

    allChanged.forEach((clientId) => {
      const state = this.awareness.getStates().get(clientId) as any;
      if (!state || clientId === this.awareness.clientID) {
        return;
      }

      const hasFiles = state.hasFiles as string[] | undefined;
      if (hasFiles && Array.isArray(hasFiles)) {
        this.peerFiles.set(clientId.toString(), {
          hasFiles,
          lastUpdate: state.filesUpdated || Date.now(),
        });
      }
    });

    // Clean up removed peers
    changed.removed.forEach((clientId) => {
      this.peerFiles.delete(clientId.toString());
    });
  }

  /**
   * Request a file if we don't have it
   */
  async ensureFile(fileId: string): Promise<boolean> {
    // Check if we already have it
    if (await hasFile(fileId)) {
      return true;
    }

    // Check if already requesting
    if (this.pendingRequests.has(fileId)) {
      return false;
    }

    // Find a peer who has this file
    const peer = this.findPeerWithFile(fileId);
    if (!peer) {
      console.warn(`No peer has file ${fileId}`);
      return false;
    }

    // Request from peer
    this.pendingRequests.add(fileId);
    this.callbacks.onFileDownloadStart?.(fileId);

    await this.transferManager.requestFile(fileId, peer, {
      onProgress: (progress, total) => {
        this.callbacks.onFileDownloadProgress?.(fileId, progress, total);
      },
      onComplete: (completedFileId) => {
        this.pendingRequests.delete(completedFileId);
        this.callbacks.onFileDownloadComplete?.(completedFileId);
        this.callbacks.onFileAvailable?.(completedFileId);
        this.updateLocalFileList(); // Update awareness
      },
      onError: (error) => {
        this.pendingRequests.delete(fileId);
        this.callbacks.onFileDownloadError?.(fileId, error);
      },
    });

    return false; // Not immediately available
  }

  /**
   * Find a peer that has the specified file
   */
  private findPeerWithFile(fileId: string): string | null {
    for (const [peerId, state] of this.peerFiles.entries()) {
      if (state.hasFiles.includes(fileId)) {
        return peerId;
      }
    }
    return null;
  }

  /**
   * Broadcast a file transfer message to a specific peer
   */
  private broadcastMessage(message: FileTransferMessage, toPeer: string): void {
    // Encode message for transmission
    const encoded = this.encodeMessage(message);

    // Send via WebRTC provider's broadcast mechanism
    // y-webrtc uses the awareness protocol for custom messages
    const payload = {
      type: "file-transfer",
      targetPeer: toPeer,
      data: encoded,
      from: this.awareness.clientID.toString(),
    };

    // Broadcast to all peers (they'll filter by targetPeer)
    this.provider.awareness.setLocalState({
      ...this.provider.awareness.getLocalState(),
      _fileMessage: payload,
      _fileMessageId: Date.now(), // Change triggers awareness update
    });
  }

  /**
   * Encode file transfer message for transmission
   */
  private encodeMessage(message: FileTransferMessage): any {
    if (message.type === "FILE_CHUNK") {
      // Convert ArrayBuffer to base64 for JSON serialization
      const { data, ...rest } = message;
      const base64 = this.arrayBufferToBase64(data);
      return { ...rest, data: base64, _isChunk: true };
    }
    return message;
  }

  /**
   * Decode received file transfer message
   */
  private decodeMessage(encoded: any): FileTransferMessage {
    if (encoded._isChunk) {
      // Convert base64 back to ArrayBuffer
      const { data, _isChunk, ...rest } = encoded;
      const arrayBuffer = this.base64ToArrayBuffer(data);
      return { ...rest, data: arrayBuffer } as FileTransferMessage;
    }
    return encoded as FileTransferMessage;
  }

  /**
   * Convert ArrayBuffer to base64 string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert base64 string to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Handle incoming file transfer message
   */
  async handleIncomingMessage(payload: any): Promise<void> {
    // Check if message is for us
    const myId = this.awareness.clientID.toString();
    if (payload.targetPeer !== myId) {
      return;
    }

    const message = this.decodeMessage(payload.data);
    await this.transferManager.handleMessage(message, payload.from);
  }

  /**
   * Get download progress for UI
   */
  getDownloadProgress(fileId: string): { progress: number; total: number } | null {
    const downloads = this.transferManager.getActiveDownloads();
    const download = downloads.find((d) => d.fileId === fileId);
    return download || null;
  }

  /**
   * Check if file is currently downloading
   */
  isDownloading(fileId: string): boolean {
    return this.pendingRequests.has(fileId);
  }

  /**
   * Get list of peers and their files
   */
  getPeerFiles(): Map<string, string[]> {
    const result = new Map<string, string[]>();
    for (const [peerId, state] of this.peerFiles.entries()) {
      result.set(peerId, state.hasFiles);
    }
    return result;
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    if (this.awarenessHandler) {
      this.awareness.off("change", this.awarenessHandler);
      this.awarenessHandler = null;
    }
    this.transferManager.cleanup();
    this.peerFiles.clear();
    this.pendingRequests.clear();
  }
}
