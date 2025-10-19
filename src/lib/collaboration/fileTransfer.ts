import type { Awareness } from "y-protocols/awareness";
import { storeFile, getFile, hasFile, type FileMetadata } from "../files/storage";

// Message types for file transfer protocol
export type FileTransferMessage =
  | { type: "FILE_REQUEST"; fileId: string; requesterId: string }
  | {
      type: "FILE_OFFER";
      fileId: string;
      size: number;
      chunkSize: number;
      totalChunks: number;
      hash: string;
      metadata: FileMetadata;
    }
  | {
      type: "FILE_CHUNK";
      fileId: string;
      chunkIndex: number;
      data: ArrayBuffer;
      isLast: boolean;
    }
  | { type: "FILE_ACK"; fileId: string; chunkIndex: number }
  | { type: "FILE_COMPLETE"; fileId: string; hash: string }
  | { type: "FILE_ERROR"; fileId: string; error: string };

const CHUNK_SIZE = 16 * 1024; // 16KB chunks (safe for WebRTC data channel)
const MAX_RETRIES = 3;
const CHUNK_TIMEOUT_MS = 10_000; // 10 seconds per chunk

interface FileTransferState {
  fileId: string;
  chunks: ArrayBuffer[];
  totalChunks: number;
  receivedChunks: Set<number>;
  metadata: FileMetadata;
  hash: string;
  onProgress?: (received: number, total: number) => void;
  onComplete?: (fileId: string) => void;
  onError?: (error: string) => void;
}

interface FileUploadState {
  fileId: string;
  blob: Blob;
  chunkSize: number;
  totalChunks: number;
  sentChunks: Set<number>;
  targetPeer: string;
}

/**
 * File transfer manager for WebRTC P2P file sharing
 */
export class FileTransferManager {
  private awareness: Awareness;
  private activeDownloads = new Map<string, FileTransferState>();
  private activeUploads = new Map<string, FileUploadState>();
  private messageHandler: ((message: FileTransferMessage, from: string) => void) | null = null;

  constructor(awareness: Awareness) {
    this.awareness = awareness;
  }

  /**
   * Set message handler for incoming file transfer messages
   */
  setMessageHandler(handler: (message: FileTransferMessage, from: string) => void) {
    this.messageHandler = handler;
  }

  /**
   * Handle incoming file transfer message
   */
  async handleMessage(message: FileTransferMessage, fromPeer: string): Promise<void> {
    switch (message.type) {
      case "FILE_REQUEST":
        await this.handleFileRequest(message, fromPeer);
        break;
      case "FILE_OFFER":
        await this.handleFileOffer(message, fromPeer);
        break;
      case "FILE_CHUNK":
        await this.handleFileChunk(message, fromPeer);
        break;
      case "FILE_ACK":
        await this.handleFileAck(message, fromPeer);
        break;
      case "FILE_COMPLETE":
        await this.handleFileComplete(message);
        break;
      case "FILE_ERROR":
        await this.handleFileError(message);
        break;
    }
  }

  /**
   * Request a file from a peer
   */
  async requestFile(
    fileId: string,
    fromPeer: string,
    callbacks?: {
      onProgress?: (received: number, total: number) => void;
      onComplete?: (fileId: string) => void;
      onError?: (error: string) => void;
    }
  ): Promise<void> {
    // Check if we already have this file
    if (await hasFile(fileId)) {
      callbacks?.onComplete?.(fileId);
      return;
    }

    // Check if already downloading
    if (this.activeDownloads.has(fileId)) {
      console.log(`Already downloading file ${fileId}`);
      return;
    }

    // Send request
    const request: FileTransferMessage = {
      type: "FILE_REQUEST",
      fileId,
      requesterId: this.awareness.clientID.toString(),
    };

    this.sendMessage(request, fromPeer);

    // Initialize download state (will be populated on FILE_OFFER)
    const downloadState: Partial<FileTransferState> = {
      fileId,
      chunks: [],
      receivedChunks: new Set(),
      onProgress: callbacks?.onProgress,
      onComplete: callbacks?.onComplete,
      onError: callbacks?.onError,
    };

    this.activeDownloads.set(fileId, downloadState as FileTransferState);
  }

  /**
   * Handle file request from peer
   */
  private async handleFileRequest(
    message: Extract<FileTransferMessage, { type: "FILE_REQUEST" }>,
    fromPeer: string
  ): Promise<void> {
    const { fileId } = message;

    // Check if we have this file
    const storedFile = await getFile(fileId);
    if (!storedFile) {
      const error: FileTransferMessage = {
        type: "FILE_ERROR",
        fileId,
        error: "File not found",
      };
      this.sendMessage(error, fromPeer);
      return;
    }

    const { blob, metadata, hash } = storedFile;
    const totalChunks = Math.ceil(blob.size / CHUNK_SIZE);

    // Send offer
    const offer: FileTransferMessage = {
      type: "FILE_OFFER",
      fileId,
      size: blob.size,
      chunkSize: CHUNK_SIZE,
      totalChunks,
      hash,
      metadata,
    };

    this.sendMessage(offer, fromPeer);

    // Start upload
    this.activeUploads.set(fileId, {
      fileId,
      blob,
      chunkSize: CHUNK_SIZE,
      totalChunks,
      sentChunks: new Set(),
      targetPeer: fromPeer,
    });

    // Send first chunk immediately
    await this.sendChunk(fileId, 0);
  }

  /**
   * Handle file offer from peer
   */
  private async handleFileOffer(
    message: Extract<FileTransferMessage, { type: "FILE_OFFER" }>,
    fromPeer: string
  ): Promise<void> {
    const { fileId, totalChunks, hash, metadata } = message;

    const downloadState = this.activeDownloads.get(fileId);
    if (!downloadState) {
      console.warn(`Received offer for unrequested file ${fileId}`);
      return;
    }

    // Update download state
    downloadState.totalChunks = totalChunks;
    downloadState.chunks = new Array(totalChunks);
    downloadState.hash = hash;
    downloadState.metadata = metadata;
  }

  /**
   * Handle incoming file chunk
   */
  private async handleFileChunk(
    message: Extract<FileTransferMessage, { type: "FILE_CHUNK" }>,
    fromPeer: string
  ): Promise<void> {
    const { fileId, chunkIndex, data, isLast } = message;

    const downloadState = this.activeDownloads.get(fileId);
    if (!downloadState) {
      console.warn(`Received chunk for unknown file ${fileId}`);
      return;
    }

    // Store chunk
    downloadState.chunks[chunkIndex] = data;
    downloadState.receivedChunks.add(chunkIndex);

    // Send ACK
    const ack: FileTransferMessage = {
      type: "FILE_ACK",
      fileId,
      chunkIndex,
    };
    this.sendMessage(ack, fromPeer);

    // Report progress
    downloadState.onProgress?.(
      downloadState.receivedChunks.size,
      downloadState.totalChunks
    );

    // Check if complete
    if (isLast || downloadState.receivedChunks.size === downloadState.totalChunks) {
      await this.finalizeDownload(fileId);
    }
  }

  /**
   * Handle chunk acknowledgment
   */
  private async handleFileAck(
    message: Extract<FileTransferMessage, { type: "FILE_ACK" }>,
    fromPeer: string
  ): Promise<void> {
    const { fileId, chunkIndex } = message;

    const uploadState = this.activeUploads.get(fileId);
    if (!uploadState) {
      return;
    }

    uploadState.sentChunks.add(chunkIndex);

    // Send next chunk
    const nextChunk = chunkIndex + 1;
    if (nextChunk < uploadState.totalChunks) {
      await this.sendChunk(fileId, nextChunk);
    } else {
      // Upload complete
      this.activeUploads.delete(fileId);
    }
  }

  /**
   * Handle file transfer complete
   */
  private async handleFileComplete(
    message: Extract<FileTransferMessage, { type: "FILE_COMPLETE" }>
  ): Promise<void> {
    const { fileId } = message;
    const downloadState = this.activeDownloads.get(fileId);

    if (downloadState) {
      downloadState.onComplete?.(fileId);
      this.activeDownloads.delete(fileId);
    }
  }

  /**
   * Handle file transfer error
   */
  private async handleFileError(
    message: Extract<FileTransferMessage, { type: "FILE_ERROR" }>
  ): Promise<void> {
    const { fileId, error } = message;
    const downloadState = this.activeDownloads.get(fileId);

    if (downloadState) {
      downloadState.onError?.(error);
      this.activeDownloads.delete(fileId);
    }
  }

  /**
   * Send a chunk to peer
   */
  private async sendChunk(fileId: string, chunkIndex: number): Promise<void> {
    const uploadState = this.activeUploads.get(fileId);
    if (!uploadState) {
      return;
    }

    const { blob, chunkSize, totalChunks, targetPeer } = uploadState;

    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, blob.size);
    const chunkBlob = blob.slice(start, end);
    const data = await chunkBlob.arrayBuffer();

    const chunk: FileTransferMessage = {
      type: "FILE_CHUNK",
      fileId,
      chunkIndex,
      data,
      isLast: chunkIndex === totalChunks - 1,
    };

    this.sendMessage(chunk, targetPeer);
  }

  /**
   * Finalize download and store in IndexedDB
   */
  private async finalizeDownload(fileId: string): Promise<void> {
    const downloadState = this.activeDownloads.get(fileId);
    if (!downloadState) {
      return;
    }

    try {
      // Combine chunks into blob
      const blob = new Blob(downloadState.chunks, { type: downloadState.metadata.type });

      // Store in IndexedDB
      await storeFile(fileId, blob, downloadState.metadata, downloadState.hash);

      // Send completion message
      const complete: FileTransferMessage = {
        type: "FILE_COMPLETE",
        fileId,
        hash: downloadState.hash,
      };

      // Notify completion
      downloadState.onComplete?.(fileId);
      this.activeDownloads.delete(fileId);

      // Update awareness to broadcast we now have this file
      this.updateHasFiles();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      downloadState.onError?.(errorMsg);
      this.activeDownloads.delete(fileId);
    }
  }

  /**
   * Update awareness with list of files we have
   */
  private async updateHasFiles(): Promise<void> {
    // This will be called from fileSync.ts to update awareness
    // Keeping method stub here for reference
  }

  /**
   * Send message to peer (to be implemented by fileSync)
   */
  private sendMessage(message: FileTransferMessage, toPeer: string): void {
    if (this.messageHandler) {
      this.messageHandler(message, toPeer);
    }
  }

  /**
   * Get active downloads for UI display
   */
  getActiveDownloads(): Array<{
    fileId: string;
    progress: number;
    total: number;
  }> {
    return Array.from(this.activeDownloads.entries()).map(([fileId, state]) => ({
      fileId,
      progress: state.receivedChunks.size,
      total: state.totalChunks,
    }));
  }

  /**
   * Cancel a download
   */
  cancelDownload(fileId: string): void {
    const downloadState = this.activeDownloads.get(fileId);
    if (downloadState) {
      downloadState.onError?.("Download cancelled");
      this.activeDownloads.delete(fileId);
    }
  }

  /**
   * Clean up all transfers
   */
  cleanup(): void {
    this.activeDownloads.clear();
    this.activeUploads.clear();
    this.messageHandler = null;
  }
}
