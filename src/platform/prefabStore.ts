/** OPFS persistence for prefab .map snippets. */
export interface PrefabEntry {
  readonly name: string;
  readonly text: string;
  readonly savedAt: number;
}

interface CacheDirectory {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<CacheDirectory>;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<{
    createWritable(): Promise<{ write(data: Uint8Array): Promise<void>; close(): Promise<void> }>;
    getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
  }>;
  removeEntry(name: string): Promise<void>;
  entries(): AsyncIterableIterator<[string, unknown]>;
}

export class PrefabStore {
  private constructor(private readonly dir: CacheDirectory) {}

  static async openOpfs(): Promise<PrefabStore> {
    const root = (await navigator.storage.getDirectory()) as unknown as CacheDirectory;
    return new PrefabStore(await root.getDirectoryHandle('prefabs', { create: true }));
  }

  private fileName(name: string): string {
    const safe = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${safe}.map`;
  }

  async save(name: string, text: string): Promise<void> {
    const file = await this.dir.getFileHandle(this.fileName(name), { create: true });
    const writable = await file.createWritable();
    await writable.write(new TextEncoder().encode(text));
    await writable.close();
    // A small index records the save time per file.
    const index = await this.readIndex();
    index[name] = Date.now();
    await this.writeRaw('index.json', JSON.stringify(index));
  }

  private async writeRaw(fileName: string, text: string): Promise<void> {
    const file = await this.dir.getFileHandle(fileName, { create: true });
    const writable = await file.createWritable();
    await writable.write(new TextEncoder().encode(text));
    await writable.close();
  }

  private async readRaw(fileName: string): Promise<string | null> {
    try {
      const file = await this.dir.getFileHandle(fileName);
      return new TextDecoder().decode(await (await file.getFile()).arrayBuffer());
    } catch {
      return null;
    }
  }

  private async readIndex(): Promise<Record<string, number>> {
    try {
      return JSON.parse((await this.readRaw('index.json')) ?? '{}') as Record<string, number>;
    } catch {
      return {};
    }
  }

  async list(): Promise<PrefabEntry[]> {
    const index = await this.readIndex();
    const out: PrefabEntry[] = [];
    for (const name of Object.keys(index)) {
      const text = await this.readRaw(this.fileName(name));
      if (text !== null) out.push({ name, text, savedAt: index[name]! });
    }
    out.sort((a, b) => b.savedAt - a.savedAt);
    return out;
  }

  async load(name: string): Promise<string | null> {
    return this.readRaw(this.fileName(name));
  }

  async remove(name: string): Promise<void> {
    try {
      await this.dir.removeEntry(this.fileName(name));
    } catch {
      // already gone
    }
    const index = await this.readIndex();
    delete index[name];
    await this.writeRaw('index.json', JSON.stringify(index));
  }
}
