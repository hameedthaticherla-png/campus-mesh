/**
 * Campus Mesh — Client-Side Chunk Storage (IndexedDB + In-Memory Fallback)
 *
 * Persists 256 KB chunk binary buffers locally in the browser so they can be
 * retrieved without touching browser memory repeatedly and served to peers over WebRTC.
 */

export interface IChunkStore {
  put(resourceId: string, chunkIndex: number, data: Uint8Array): Promise<void>;
  get(resourceId: string, chunkIndex: number): Promise<Uint8Array | null>;
  has(resourceId: string, chunkIndex: number): Promise<boolean>;
  delete(resourceId: string, chunkIndex: number): Promise<void>;
  getAvailableChunks(resourceId: string): Promise<number[]>;
  clear(resourceId: string): Promise<void>;
}

/**
 * In-Memory Chunk Store implementation for Node.js tests or environments
 * where IndexedDB is blocked/unavailable.
 */
export class MemoryChunkStore implements IChunkStore {
  private readonly storage = new Map<string, Uint8Array>();

  private makeKey(resourceId: string, chunkIndex: number): string {
    return `${resourceId}::${chunkIndex}`;
  }

  public async put(resourceId: string, chunkIndex: number, data: Uint8Array): Promise<void> {
    this.storage.set(this.makeKey(resourceId, chunkIndex), new Uint8Array(data));
  }

  public async get(resourceId: string, chunkIndex: number): Promise<Uint8Array | null> {
    const data = this.storage.get(this.makeKey(resourceId, chunkIndex));
    return data ? new Uint8Array(data) : null;
  }

  public async has(resourceId: string, chunkIndex: number): Promise<boolean> {
    return this.storage.has(this.makeKey(resourceId, chunkIndex));
  }

  public async delete(resourceId: string, chunkIndex: number): Promise<void> {
    this.storage.delete(this.makeKey(resourceId, chunkIndex));
  }

  public async getAvailableChunks(resourceId: string): Promise<number[]> {
    const prefix = `${resourceId}::`;
    const indices: number[] = [];
    for (const key of this.storage.keys()) {
      if (key.startsWith(prefix)) {
        const indexStr = key.slice(prefix.length);
        const idx = parseInt(indexStr, 10);
        if (!isNaN(idx)) {
          indices.push(idx);
        }
      }
    }
    return indices.sort((a, b) => a - b);
  }

  public async clear(resourceId: string): Promise<void> {
    const prefix = `${resourceId}::`;
    for (const key of Array.from(this.storage.keys())) {
      if (key.startsWith(prefix)) {
        this.storage.delete(key);
      }
    }
  }
}

/**
 * Persistent IndexedDB Chunk Store for browser environments.
 */
export class IndexedDbChunkStore implements IChunkStore {
  private readonly dbName: string;
  private readonly storeName = 'chunks';
  private dbPromise: Promise<IDBDatabase> | null = null;
  private memoryFallback: MemoryChunkStore | null = null;

  constructor(dbName = 'campus-mesh-storage') {
    this.dbName = dbName;
  }

  private async getDb(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') {
      return null;
    }

    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'key' });
          store.createIndex('by_resource', 'resourceId', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    try {
      return await this.dbPromise;
    } catch {
      this.dbPromise = null;
      return null;
    }
  }

  private getFallback(): MemoryChunkStore {
    if (!this.memoryFallback) {
      this.memoryFallback = new MemoryChunkStore();
    }
    return this.memoryFallback;
  }

  public async put(resourceId: string, chunkIndex: number, data: Uint8Array): Promise<void> {
    const db = await this.getDb();
    if (!db) {
      return this.getFallback().put(resourceId, chunkIndex, data);
    }

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const key = `${resourceId}::${chunkIndex}`;
      const record = {
        key,
        resourceId,
        chunkIndex,
        data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      };

      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async get(resourceId: string, chunkIndex: number): Promise<Uint8Array | null> {
    const db = await this.getDb();
    if (!db) {
      return this.getFallback().get(resourceId, chunkIndex);
    }

    return new Promise<Uint8Array | null>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const key = `${resourceId}::${chunkIndex}`;

      const req = store.get(key);
      req.onsuccess = () => {
        if (!req.result || !req.result.data) {
          resolve(null);
        } else {
          resolve(new Uint8Array(req.result.data));
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async has(resourceId: string, chunkIndex: number): Promise<boolean> {
    const db = await this.getDb();
    if (!db) {
      return this.getFallback().has(resourceId, chunkIndex);
    }

    return new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const key = `${resourceId}::${chunkIndex}`;

      const req = store.count(key);
      req.onsuccess = () => resolve(req.result > 0);
      req.onerror = () => reject(req.error);
    });
  }

  public async delete(resourceId: string, chunkIndex: number): Promise<void> {
    const db = await this.getDb();
    if (!db) {
      return this.getFallback().delete(resourceId, chunkIndex);
    }

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const key = `${resourceId}::${chunkIndex}`;

      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async getAvailableChunks(resourceId: string): Promise<number[]> {
    const db = await this.getDb();
    if (!db) {
      return this.getFallback().getAvailableChunks(resourceId);
    }

    return new Promise<number[]>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const index = store.index('by_resource');
      const req = index.getAll(IDBKeyRange.only(resourceId));

      req.onsuccess = () => {
        const records = req.result as Array<{ chunkIndex: number }>;
        const indices = records.map((r) => r.chunkIndex).sort((a, b) => a - b);
        resolve(indices);
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async clear(resourceId: string): Promise<void> {
    const db = await this.getDb();
    if (!db) {
      return this.getFallback().clear(resourceId);
    }

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const index = store.index('by_resource');
      const req = index.openKeyCursor(IDBKeyRange.only(resourceId));

      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
    });
  }
}
