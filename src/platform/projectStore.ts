import type { CacheDirectory } from './textureCache';

export interface StoredAutosave {
  readonly project: string;
  readonly dirty: boolean;
}

/** OPFS persistence for autosave, recovery metadata, settings and recent files. */
export class ProjectStore {
  private constructor(private readonly dir: CacheDirectory) {}

  static async openOpfs(): Promise<ProjectStore> {
    const root = (await navigator.storage.getDirectory()) as unknown as CacheDirectory;
    return new ProjectStore(await root.getDirectoryHandle('projects', { create: true }));
  }

  private async write(name: string, text: string): Promise<void> {
    const file = await this.dir.getFileHandle(name, { create: true });
    const writable = await file.createWritable();
    await writable.write(new TextEncoder().encode(text));
    await writable.close();
  }

  private async read(name: string): Promise<string | null> {
    try {
      const file = await this.dir.getFileHandle(name);
      return new TextDecoder().decode(await (await file.getFile()).arrayBuffer());
    } catch {
      return null;
    }
  }

  saveAutosave(project: string, dirty: boolean): Promise<void> {
    return this.write('autosave.json', JSON.stringify({ project, dirty }));
  }

  async loadAutosave(): Promise<StoredAutosave | null> {
    const text = await this.read('autosave.json');
    if (!text) return null;
    try {
      const value = JSON.parse(text) as StoredAutosave;
      return typeof value.project === 'string' ? value : null;
    } catch {
      return null;
    }
  }

  clearAutosave(): Promise<void> {
    return this.saveAutosave('', false);
  }

  saveSettings(settings: Record<string, unknown>): Promise<void> {
    return this.write('settings.json', JSON.stringify(settings));
  }

  async loadSettings(): Promise<Record<string, unknown> | null> {
    const text = await this.read('settings.json');
    try {
      return text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  saveRecentFiles(names: readonly string[]): Promise<void> {
    return this.write('recent.json', JSON.stringify(names.slice(0, 10)));
  }
}
