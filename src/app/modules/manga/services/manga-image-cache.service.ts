import { Injectable } from '@angular/core';

const DB_NAME = 'shikicinema-manga-cache';
const STORE_NAME = 'images';
const DB_VERSION = 1;

// Max total stored bytes (~300 MB). Oldest entries are evicted when exceeded.
const MAX_BYTES = 300 * 1024 * 1024;

interface CacheEntry {
    key: string;
    dataUrl: string;
    size: number;
    ts: number;
}

@Injectable({ providedIn: 'root' })
export class MangaImageCacheService {
    private dbPromise: Promise<IDBDatabase> | null = null;

    private open(): Promise<IDBDatabase> {
        if (this.dbPromise) return this.dbPromise;

        this.dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = (e) => {
                const db = (e.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                    store.createIndex('ts', 'ts');
                }
            };

            req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
            req.onerror = () => reject(req.error);
        });

        return this.dbPromise;
    }

    async get(key: string): Promise<string | null> {
        const db = await this.open();

        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(key);

            req.onsuccess = () => {
                const entry: CacheEntry | undefined = req.result;
                if (!entry) {
                    resolve(null); return;
                }
                // Touch timestamp for LRU
                entry.ts = Date.now();
                store.put(entry);
                resolve(entry.dataUrl);
            };

            req.onerror = () => resolve(null);
        });
    }

    async set(key: string, dataUrl: string): Promise<void> {
        const db = await this.open();
        const size = dataUrl.length * 2;

        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const entry: CacheEntry = { key, dataUrl, size, ts: Date.now() };

            store.put(entry);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });

        // Evict old entries asynchronously without blocking the caller
        this.evictIfNeeded(db, size).catch(() => undefined);
    }

    private async evictIfNeeded(db: IDBDatabase, addedBytes: number): Promise<void> {
        const { total, entries } = await this.readAll(db);

        if (total + addedBytes <= MAX_BYTES) return;

        // Sort ascending by ts (oldest first)
        entries.sort((a, b) => a.ts - b.ts);

        let freed = 0;
        const toDelete: string[] = [];

        for (const e of entries) {
            if (total - freed + addedBytes <= MAX_BYTES) break;
            toDelete.push(e.key);
            freed += e.size;
        }

        if (!toDelete.length) return;

        await new Promise<void>((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);

            toDelete.forEach((k) => store.delete(k));
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    }

    private readAll(db: IDBDatabase): Promise<{ total: number; entries: Pick<CacheEntry, 'key' | 'size' | 'ts'>[] }> {
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.openCursor();
            let total = 0;
            const entries: Pick<CacheEntry, 'key' | 'size' | 'ts'>[] = [];

            req.onsuccess = (e) => {
                const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
                if (!cursor) {
                    resolve({ total, entries }); return;
                }

                const { key, size, ts } = cursor.value as CacheEntry;
                total += size;
                entries.push({ key, size, ts });
                cursor.continue();
            };

            req.onerror = () => resolve({ total: 0, entries: [] });
        });
    }

    async getStats(): Promise<{ count: number; bytes: number }> {
        const db = await this.open();
        const { total, entries } = await this.readAll(db);
        return { count: entries.length, bytes: total };
    }

    async clear(): Promise<void> {
        const db = await this.open();

        await new Promise<void>((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    }
}
