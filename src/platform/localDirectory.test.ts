import { describe, expect, it } from 'vitest';
import { kvDirectory, type KvBackend } from './localDirectory';

function memoryBackend(): KvBackend & { data: Map<string, ArrayBuffer> } {
  const data = new Map<string, ArrayBuffer>();
  return {
    data,
    async get(key) {
      return data.get(key);
    },
    async put(key, value) {
      data.set(key, value);
    },
    async delete(key) {
      return data.delete(key);
    },
    async keys() {
      return [...data.keys()];
    },
  };
}

async function writeText(
  dir: ReturnType<typeof kvDirectory>,
  name: string,
  text: string,
): Promise<void> {
  const file = await dir.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(new TextEncoder().encode(text));
  await writable.close();
}

async function readText(dir: ReturnType<typeof kvDirectory>, name: string): Promise<string> {
  const file = await dir.getFileHandle(name);
  return new TextDecoder().decode(await (await file.getFile()).arrayBuffer());
}

describe('kvDirectory', () => {
  it('round-trips a file write and read', async () => {
    const dir = kvDirectory(memoryBackend());
    await writeText(dir, 'a.txt', 'hello');
    expect(await readText(dir, 'a.txt')).toBe('hello');
  });

  it('keeps sibling directories isolated by prefix', async () => {
    const backend = memoryBackend();
    const root = kvDirectory(backend);
    const prefabs = await root.getDirectoryHandle('prefabs', { create: true });
    const projects = await root.getDirectoryHandle('projects', { create: true });
    await writeText(prefabs, 'x.map', 'prefab');
    await writeText(projects, 'x.map', 'project');
    expect(await readText(prefabs, 'x.map')).toBe('prefab');
    expect(await readText(projects, 'x.map')).toBe('project');
    expect(backend.data.has('prefabs/x.map')).toBe(true);
    expect(backend.data.has('projects/x.map')).toBe(true);
  });

  it('throws NotFoundError when reading a missing file without create', async () => {
    const dir = kvDirectory(memoryBackend());
    await expect(dir.getFileHandle('missing')).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  it('throws NotFoundError when removing a missing entry', async () => {
    const dir = kvDirectory(memoryBackend());
    await expect(dir.removeEntry('missing')).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  it('removeEntry deletes the file', async () => {
    const dir = kvDirectory(memoryBackend());
    await writeText(dir, 'a.txt', 'hello');
    await dir.removeEntry('a.txt');
    await expect(dir.getFileHandle('a.txt')).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  it('throws NotFoundError when opening a directory that has no keys without create', async () => {
    const dir = kvDirectory(memoryBackend());
    await expect(dir.getDirectoryHandle('empty')).rejects.toMatchObject({ name: 'NotFoundError' });
    await writeText(dir, 'a.txt', 'hello');
    const nested = await dir.getDirectoryHandle('.', { create: true });
    await writeText(nested, 'sub/b.txt', 'nested');
  });

  it('accepts a directory without create once a key exists under it', async () => {
    const backend = memoryBackend();
    const root = kvDirectory(backend);
    const created = await root.getDirectoryHandle('prefabs', { create: true });
    await writeText(created, 'x', 'y');
    await expect(root.getDirectoryHandle('prefabs')).resolves.toBeDefined();
  });

  it('slices a Uint8Array view instead of copying the whole buffer', async () => {
    const backend = memoryBackend();
    const dir = kvDirectory(backend);
    const file = await dir.getFileHandle('slice', { create: true });
    const writable = await file.createWritable();
    const backing = new Uint8Array([9, 9, 1, 2, 9, 9]);
    await writable.write(backing.subarray(2, 4));
    await writable.close();
    expect(new Uint8Array(backend.data.get('slice')!)).toEqual(new Uint8Array([1, 2]));
  });
});
