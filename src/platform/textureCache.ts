import type { ConvertedTexture } from '@core/types/index';
import { openLocalDirectory } from './localDirectory';
import type { CacheDirectory, CacheFile } from './localDirectory';

export type { CacheDirectory, CacheFile } from './localDirectory';

const CACHE_DIR = 'texture-cache';

/** Hex of the UTF-8 key: any cache key string becomes a safe file name. */
function fileNameForKey(key: string): string {
  const bytes = new TextEncoder().encode(key);
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * An OPFS cache of converted textures, keyed by an opaque string the caller
 * composes from the source and the file identity (for example the game
 * directory, the pack file or loose path, and the size). The file layout is
 * the width and height as little-endian u32s followed by the RGBA8 bytes.
 */
export class TextureCache {
  private constructor(private readonly dir: CacheDirectory) {}

  static async open(root: CacheDirectory): Promise<TextureCache> {
    return new TextureCache(await root.getDirectoryHandle(CACHE_DIR, { create: true }));
  }

  /** The production entry point: the origin's local storage, OPFS or the IndexedDB fallback. */
  static async openLocal(): Promise<TextureCache> {
    return TextureCache.open(await openLocalDirectory());
  }

  async get(key: string): Promise<ConvertedTexture | null> {
    let file: CacheFile;
    try {
      file = await this.dir.getFileHandle(fileNameForKey(key));
    } catch {
      return null;
    }
    const buffer = await (await file.getFile()).arrayBuffer();
    if (buffer.byteLength < 8) {
      return null;
    }
    const view = new DataView(buffer);
    const width = view.getUint32(0, true);
    const height = view.getUint32(4, true);
    if (buffer.byteLength !== 8 + width * height * 4) {
      return null;
    }
    return { width, height, rgba: new Uint8Array(buffer, 8) };
  }

  async put(key: string, texture: ConvertedTexture): Promise<void> {
    const file = await this.dir.getFileHandle(fileNameForKey(key), { create: true });
    const writable = await file.createWritable();
    const buffer = new ArrayBuffer(8 + texture.rgba.byteLength);
    const view = new DataView(buffer);
    view.setUint32(0, texture.width, true);
    view.setUint32(4, texture.height, true);
    new Uint8Array(buffer, 8).set(texture.rgba);
    await writable.write(buffer);
    await writable.close();
  }

  async remove(key: string): Promise<void> {
    try {
      await this.dir.removeEntry(fileNameForKey(key));
    } catch {
      // An absent entry is already removed.
    }
  }
}
