/**
 * Local persistent storage for the editor's own data (autosave, settings,
 * prefabs, the texture cache). OPFS is the primary backing, but it is not
 * usable in every browser — WebKit's `navigator.storage.getDirectory()`
 * itself rejects — so the root directory is chosen by probing OPFS with a
 * real write and falling back to an IndexedDB-backed implementation of the
 * same directory interface.
 */

/** The minimal slice of the OPFS / File System Access directory API the
 * stores use, structural so tests can substitute an in-memory directory. */
export interface CacheDirectory {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<CacheDirectory>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<CacheFile>;
  removeEntry(name: string): Promise<void>;
}

export interface CacheFile {
  getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
  createWritable(): Promise<{
    write(data: ArrayBuffer | Uint8Array): Promise<void>;
    close(): Promise<void>;
  }>;
}

function notFound(): DOMException {
  return new DOMException('not found', 'NotFoundError');
}

/** The key-value operations the IndexedDB-backed directory needs. */
export interface KvBackend {
  get(key: string): Promise<ArrayBuffer | undefined>;
  put(key: string, value: ArrayBuffer): Promise<void>;
  delete(key: string): Promise<boolean>;
  keys(): Promise<string[]>;
}

function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof Uint8Array) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  }
  return data;
}

/**
 * A CacheDirectory on top of a flat key-value store. Directories are
 * implicit in the key space: a directory exists while a key starts with
 * its prefix, and `create` simply allows descending. File writes buffer
 * in memory and commit on close, like the OPFS writable does.
 */
export function kvDirectory(backend: KvBackend, prefix = ''): CacheDirectory {
  const join = (name: string): string => (prefix ? `${prefix}/${name}` : name);
  return {
    async getDirectoryHandle(name, options) {
      const child = join(name);
      if (!options?.create) {
        const keys = await backend.keys();
        if (!keys.some((key) => key.startsWith(`${child}/`))) {
          throw notFound();
        }
      }
      return kvDirectory(backend, child);
    },
    async getFileHandle(name, options): Promise<CacheFile> {
      const path = join(name);
      if (!options?.create && (await backend.get(path)) === undefined) {
        throw notFound();
      }
      return {
        async getFile() {
          const data = await backend.get(path);
          if (data === undefined) {
            throw notFound();
          }
          return { arrayBuffer: async () => data.slice(0) };
        },
        async createWritable() {
          let buffer = new ArrayBuffer(0);
          return {
            async write(data: ArrayBuffer | Uint8Array) {
              buffer = toArrayBuffer(data);
            },
            async close() {
              await backend.put(path, buffer);
            },
          };
        },
      };
    },
    async removeEntry(name) {
      if (!(await backend.delete(join(name)))) {
        throw notFound();
      }
    },
  };
}

/** A KvBackend on one IndexedDB database with a single `files` store. */
export function idbKvBackend(databaseName: string): KvBackend {
  let database: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => {
    database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('files');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return database;
  };
  const request = async <T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('files', mode);
      const result = run(transaction.objectStore('files'));
      result.onsuccess = () => resolve(result.result);
      result.onerror = () => reject(result.error);
    });
  };
  return {
    get: (key) => request('readonly', (store) => store.get(key)),
    async put(key, value) {
      await request('readwrite', (store) => store.put(value, key));
    },
    async delete(key) {
      if ((await this.get(key)) === undefined) {
        return false;
      }
      await request('readwrite', (store) => store.delete(key));
      return true;
    },
    async keys() {
      const keys = await request('readonly', (store) => store.getAllKeys());
      return keys.map(String);
    },
  };
}

/**
 * Probes OPFS with a real write, read and delete cycle. The API surface
 * existing is not enough: in WebKit `getDirectory()` itself rejects, and
 * private modes can accept writes that never persist. Returns null when
 * any step fails.
 */
async function probeOpfs(): Promise<CacheDirectory | null> {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.storage?.getDirectory !== 'function') {
      return null;
    }
    const root = (await navigator.storage.getDirectory()) as unknown as CacheDirectory;
    const probe = await root.getDirectoryHandle('joole-probe', { create: true });
    const file = await probe.getFileHandle('probe', { create: true });
    const writable = await file.createWritable();
    await writable.write(new Uint8Array([1, 2, 3]));
    await writable.close();
    const buffer = await (await file.getFile()).arrayBuffer();
    await probe.removeEntry('probe');
    await root.removeEntry('joole-probe');
    return buffer.byteLength === 3 ? root : null;
  } catch {
    return null;
  }
}

let root: Promise<CacheDirectory> | null = null;

/**
 * The origin-local root directory: OPFS when the probe passes, otherwise
 * the IndexedDB backing. Probed once per session.
 */
export function openLocalDirectory(): Promise<CacheDirectory> {
  root ??= (async () => {
    return (await probeOpfs()) ?? kvDirectory(idbKvBackend('joole-local'));
  })();
  return root;
}
