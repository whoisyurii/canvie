import { useEffect, useState, useCallback, useRef } from "react";
import type { FileSyncManager } from "@/lib/collaboration/fileSync";
import { createObjectURLFromId, hasFile } from "@/lib/files/storage";

interface FileDownloadStatus {
  fileId: string;
  progress: number;
  total: number;
  percentage: number;
}

interface UseFileSyncResult {
  // Request a file if not available locally
  ensureFile: (fileId: string) => Promise<boolean>;

  // Check if file is available locally
  isFileAvailable: (fileId: string) => Promise<boolean>;

  // Get object URL for a file ID
  getFileURL: (fileId: string) => Promise<string | null>;

  // Get download status for a file
  getDownloadStatus: (fileId: string) => FileDownloadStatus | null;

  // List of files currently downloading
  activeDownloads: FileDownloadStatus[];

  // Whether file sync is ready
  isReady: boolean;
}

/**
 * React hook for file synchronization in collaboration
 */
export function useFileSync(
  fileSyncManager: FileSyncManager | null
): UseFileSyncResult {
  const [activeDownloads, setActiveDownloads] = useState<FileDownloadStatus[]>([]);
  const [isReady, setIsReady] = useState(false);
  const downloadStates = useRef(new Map<string, FileDownloadStatus>());

  useEffect(() => {
    if (!fileSyncManager) {
      setIsReady(false);
      return;
    }

    setIsReady(true);

    // Poll for download updates (could be optimized with events)
    const interval = setInterval(() => {
      if (!fileSyncManager) return;

      const newDownloads: FileDownloadStatus[] = [];
      const states = downloadStates.current;

      // Update download states
      for (const [fileId, state] of states.entries()) {
        const progress = fileSyncManager.getDownloadProgress(fileId);
        if (progress) {
          const status: FileDownloadStatus = {
            fileId,
            progress: progress.progress,
            total: progress.total,
            percentage: (progress.progress / progress.total) * 100,
          };
          states.set(fileId, status);
          newDownloads.push(status);
        } else {
          // Download complete or cancelled
          states.delete(fileId);
        }
      }

      setActiveDownloads(newDownloads);
    }, 100); // Poll every 100ms

    return () => {
      clearInterval(interval);
    };
  }, [fileSyncManager]);

  const ensureFile = useCallback(
    async (fileId: string): Promise<boolean> => {
      if (!fileSyncManager) {
        return false;
      }

      // Add to tracking if not already present
      if (!downloadStates.current.has(fileId)) {
        downloadStates.current.set(fileId, {
          fileId,
          progress: 0,
          total: 1,
          percentage: 0,
        });
      }

      return await fileSyncManager.ensureFile(fileId);
    },
    [fileSyncManager]
  );

  const isFileAvailable = useCallback(async (fileId: string): Promise<boolean> => {
    return await hasFile(fileId);
  }, []);

  const getFileURL = useCallback(async (fileId: string): Promise<string | null> => {
    return await createObjectURLFromId(fileId);
  }, []);

  const getDownloadStatus = useCallback(
    (fileId: string): FileDownloadStatus | null => {
      return downloadStates.current.get(fileId) || null;
    },
    []
  );

  return {
    ensureFile,
    isFileAvailable,
    getFileURL,
    getDownloadStatus,
    activeDownloads,
    isReady,
  };
}
