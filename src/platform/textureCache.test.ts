import { describe, expect, it } from 'vitest';
import { TextureCache, type CacheDirectory, type CacheFile } from './textureCache';

/** An in-memory implementation of the OPFS directory slice the cache uses. */
function memoryDirectory(): CacheDirectory {
  const dirs = new Map<string, CacheDirectory>();
  const files = new Map<string, ArrayBuffer>();
  const dir: CacheDirectory = {
    async getDirectoryHandle(name, options) {
      const existing = dirs.get(name);
      if (existing) {
        return existing;
      }
      if (!options?.create) {
        throw new DOMException('not found', 'NotFoundError');
      }
      const created = memoryDirectory();
      dirs.set(name, created);
      return created;
    },
    async getFileHandle(name, options): Promise<CacheFile> {
      if (!files.has(name) && !options?.create) {
        throw new DOMException('not found', 'NotFoundError');
      }
      if (!files.has(name)) {
        files.set(name, new ArrayBuffer(0));
      }
      return {
        async getFile() {
          const data = files.get(name)!;
          return { arrayBuffer: async () => data.slice(0) };
        },
        async createWritable() {
          return {
            async write(data: ArrayBuffer | Uint8Array) {
              files.set(
                name,
                data instanceof Uint8Array
                  ? (data.buffer.slice(
                      data.byteOffset,
                      data.byteOffset + data.byteLength,
                    ) as ArrayBuffer)
                  : data,
              );
            },
            async close() {},
          };
        },
      };
    },
    async removeEntry(name) {
      if (!files.delete(name)) {
        throw new DOMException('not found', 'NotFoundError');
      }
    },
  };
  return dir;
}

const texture = {
  width: 2,
  height: 1,
  rgba: new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255]),
};

describe('TextureCache', () => {
  it('round-trips a texture with width, height and pixels', async () => {
    const cache = await TextureCache.open(memoryDirectory());
    await cache.put('baseq2:pack/pak0.pak:e2u1/mine10_1:1234', texture);
    const loaded = await cache.get('baseq2:pack/pak0.pak:e2u1/mine10_1:1234');
    expect(loaded).not.toBeNull();
    expect(loaded!.width).toBe(2);
    expect(loaded!.height).toBe(1);
    expect(Array.from(loaded!.rgba)).toEqual(Array.from(texture.rgba));
  });

  it('returns null for a missing key', async () => {
    const cache = await TextureCache.open(memoryDirectory());
    expect(await cache.get('nothing-here')).toBeNull();
  });

  it('accepts keys with slashes and unicode, encoded into safe file names', async () => {
    const cache = await TextureCache.open(memoryDirectory());
    const key = 'mod:loose/textures/e2u1/ääriö.wal:999';
    await cache.put(key, texture);
    expect((await cache.get(key))!.width).toBe(2);
  });

  it('remove deletes the entry and tolerates removal of a missing key', async () => {
    const cache = await TextureCache.open(memoryDirectory());
    await cache.put('key', texture);
    await cache.remove('key');
    expect(await cache.get('key')).toBeNull();
    await cache.remove('key');
  });
});
