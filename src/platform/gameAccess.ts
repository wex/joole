import type { Inflate } from '@core/types/index';
import { blobByteSource } from './blobByteSource';
import type { GameFileEntry } from './gameFiles';
import { groupGameFiles } from './gameFiles';
import { VirtualFileSystem } from './vfs';

/**
 * The Chromium path: the user picks their game folder once, the handle is
 * kept in IndexedDB and permission is requested again on the next start.
 * Firefox and Safari use the webkitdirectory fallback instead.
 */

const DB_NAME = 'joole';
const STORE = 'handles';
const KEY = 'game-directory';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveGameDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(handle, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** The stored handle, or null. Permission is re-requested when needed. */
export async function loadGameDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDb();
  const handle = await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve(request.result as FileSystemDirectoryHandle | undefined);
    request.onerror = () => reject(request.error);
  });
  if (!handle) {
    return null;
  }
  const state = await handle.queryPermission({ mode: 'read' });
  if (state === 'granted') {
    return handle;
  }
  const requested = await handle.requestPermission({ mode: 'read' });
  return requested === 'granted' ? handle : null;
}

/** True when the File System Access API is available (Chromium). */
export function hasDirectoryPicker(): boolean {
  return 'showDirectoryPicker' in window;
}

export async function pickGameDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' });
    await saveGameDirectoryHandle(handle);
    return handle;
  } catch {
    // the user cancelled the picker
    return null;
  }
}

/** Reads every file of a picked directory tree, recursively. */
export async function collectFromHandle(
  root: FileSystemDirectoryHandle,
  prefix = '',
): Promise<GameFileEntry[]> {
  const out: GameFileEntry[] = [];
  for await (const [name, child] of root.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (child.kind === 'directory') {
      out.push(...(await collectFromHandle(child, path)));
    } else {
      const file = await child.getFile();
      out.push({ path, source: blobByteSource(file) });
    }
  }
  return out;
}

/** The fallback path: files of an input element with webkitdirectory. */
export function entriesFromFileList(files: FileList): GameFileEntry[] {
  const out: GameFileEntry[] = [];
  for (const file of files) {
    // webkitRelativePath starts with the picked directory's own name
    const relative = (file.webkitRelativePath || file.name).split('/').slice(1).join('/');
    if (relative) {
      out.push({ path: relative, source: blobByteSource(file) });
    }
  }
  return out;
}

/** The single-pak fallback: a picked pak0.pak as the only content. */
export function entriesFromSinglePak(file: File): GameFileEntry[] {
  return [{ path: `baseq2/${file.name}`, source: blobByteSource(file) }];
}

/** Groups the entries and opens the virtual filesystem over them. */
export async function openGameVfs(
  entries: GameFileEntry[],
  modDir: string | null,
  inflate: Inflate,
): Promise<VirtualFileSystem> {
  const groups = groupGameFiles(entries, modDir);
  const base = groups.get('baseq2');
  if (!base) {
    throw new Error('no baseq2 directory found in the picked files');
  }
  const inputs = [...groups.values()];
  return VirtualFileSystem.open(inputs, inflate);
}
