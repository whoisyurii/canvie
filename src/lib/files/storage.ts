import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "realitea-files";
const DB_VERSION = 1;
const STORE_NAME = "files";

interface StoredFile {
  id: string;
  blob: Blob;
  metadata: FileMetadata;
  hash: string;
  timestamp: number;
}

interface FileMetadata {
  name: string;
  type: string;
  size: number;
  ownerId: string;
  ownerName: string;
}

interface FileDB {
  files: {
    key: string;
    value: StoredFile;
    indexes: { hash: string };
  };
}

let dbInstance: IDBPDatabase<FileDB> | null = null;

/**
 * Initialize or get the IndexedDB database instance
 */
async function getDB(): Promise<IDBPDatabase<FileDB>> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB<FileDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Create files store
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        // Index by hash for deduplication
        store.createIndex("hash", "hash", { unique: false });
      }
    },
  });

  return dbInstance;
}

/**
 * Store a file in IndexedDB
 */
export async function storeFile(
  id: string,
  blob: Blob,
  metadata: FileMetadata,
  hash: string
): Promise<void> {
  const db = await getDB();

  const storedFile: StoredFile = {
    id,
    blob,
    metadata,
    hash,
    timestamp: Date.now(),
  };

  await db.put(STORE_NAME, storedFile);
}

/**
 * Get a file from IndexedDB by ID
 */
export async function getFile(id: string): Promise<StoredFile | null> {
  const db = await getDB();
  const file = await db.get(STORE_NAME, id);
  return file || null;
}

/**
 * Check if a file exists by ID
 */
export async function hasFile(id: string): Promise<boolean> {
  const db = await getDB();
  const count = await db.count(STORE_NAME, id);
  return count > 0;
}

/**
 * Check if a file with the given hash exists (for deduplication)
 */
export async function hasFileByHash(hash: string): Promise<StoredFile | null> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const index = tx.store.index("hash");
  const file = await index.get(hash);
  return file || null;
}

/**
 * Delete a file from IndexedDB
 */
export async function deleteFile(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
}

/**
 * Get all stored file IDs
 */
export async function getAllFileIds(): Promise<string[]> {
  const db = await getDB();
  const keys = await db.getAllKeys(STORE_NAME);
  return keys as string[]; // Keys are strings since keyPath is "id"
}

/**
 * Get total storage size used (approximate)
 */
export async function getStorageSize(): Promise<number> {
  const db = await getDB();
  const files = await db.getAll(STORE_NAME);
  return files.reduce((total, file) => total + file.blob.size, 0);
}

/**
 * Clear old files to free up space (LRU eviction)
 */
export async function clearOldFiles(keepCount: number = 50): Promise<number> {
  const db = await getDB();
  const files = await db.getAll(STORE_NAME);

  // Sort by timestamp (oldest first)
  files.sort((a, b) => a.timestamp - b.timestamp);

  // Delete oldest files beyond keepCount
  const toDelete = files.slice(0, Math.max(0, files.length - keepCount));

  for (const file of toDelete) {
    await db.delete(STORE_NAME, file.id);
  }

  return toDelete.length;
}

/**
 * Compute SHA-256 hash of a file
 */
export async function hashFile(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

/**
 * Create an object URL from a stored file ID
 */
export async function createObjectURLFromId(id: string): Promise<string | null> {
  const file = await getFile(id);
  if (!file) {
    return null;
  }
  return URL.createObjectURL(file.blob);
}

/**
 * Export for type usage
 */
export type { StoredFile, FileMetadata };
