import type { ByteSource, Inflate } from '@core/types/index';
import { readPakDirectory, readPkzDirectory, readPkzFile } from '@core/formats/index';
import type { PakEntry, PkzEntry } from '@core/formats/index';
import { searchOrder } from '@game/q2/index';
import type { GameDirKind } from '@game/q2/index';

/** The contents of one game directory offered to the virtual filesystem. */
export interface VfsDirectoryInput {
  gameDir: GameDirKind;
  /** Loose files: path relative to the game directory to its byte source. */
  loose: Map<string, ByteSource>;
  /** Pack file names as listed in the directory, to the pack byte sources. */
  packs: Map<string, ByteSource>;
}

export type VfsSource =
  | { kind: 'pack'; gameDir: GameDirKind; packFile: string }
  | { kind: 'loose'; gameDir: GameDirKind };

export interface VfsHit {
  /** Size of the uncompressed file. */
  size: number;
  source: VfsSource;
  read(): Promise<Uint8Array>;
}

export function normalizeVfsPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}

type PackState = {
  source: ByteSource;
  packFile: string;
  gameDir: GameDirKind;
} & (
  { kind: 'pak'; entries: Map<string, PakEntry> } | { kind: 'pkz'; entries: Map<string, PkzEntry> }
);

type OrderedSource =
  | { type: 'pack'; pack: PackState }
  | { type: 'loose'; gameDir: GameDirKind; files: Map<string, ByteSource> };

/**
 * The virtual filesystem that combines loose files, paks and pkzs in the
 * search order of P1.3: mod before baseq2, packages before loose files,
 * the package sorted last searched first. Lookups are case-insensitive
 * and accept both slash directions, like the game engine.
 */
export class VirtualFileSystem {
  private constructor(
    private readonly ordered: OrderedSource[],
    private readonly inflate: Inflate,
  ) {}

  static async open(inputs: VfsDirectoryInput[], inflate: Inflate): Promise<VirtualFileSystem> {
    const mod = inputs.find((i) => i.gameDir === 'mod');
    const base = inputs.find((i) => i.gameDir === 'baseq2');
    if (!base) {
      throw new Error('the baseq2 directory is required');
    }
    const order = searchOrder({
      modFiles: mod ? [...mod.packs.keys()] : null,
      baseFiles: [...base.packs.keys()],
    });

    const packStates = new Map<string, Promise<PackState>>();
    async function openPack(input: VfsDirectoryInput, file: string): Promise<PackState> {
      const source = input.packs.get(file)!;
      const base = { source, packFile: file, gameDir: input.gameDir };
      if (file.toLowerCase().endsWith('.pkz')) {
        const entries = new Map<string, PkzEntry>();
        for (const entry of await readPkzDirectory(source)) {
          entries.set(normalizeVfsPath(entry.name), entry);
        }
        return { ...base, kind: 'pkz', entries };
      }
      const entries = new Map<string, PakEntry>();
      for (const entry of await readPakDirectory(source)) {
        entries.set(normalizeVfsPath(entry.name), entry);
      }
      return { ...base, kind: 'pak', entries };
    }

    const ordered: OrderedSource[] = [];
    for (const entry of order) {
      const input = entry.gameDir === 'mod' ? mod : base;
      if (!input) {
        continue;
      }
      if (entry.kind === 'pack') {
        const key = `${entry.gameDir}/${entry.file}`;
        if (!packStates.has(key)) {
          packStates.set(key, openPack(input, entry.file));
        }
        ordered.push({ type: 'pack', pack: await packStates.get(key)! });
      } else {
        const files = new Map<string, ByteSource>();
        for (const [path, source] of input.loose) {
          files.set(normalizeVfsPath(path), source);
        }
        ordered.push({ type: 'loose', gameDir: input.gameDir, files });
      }
    }
    return new VirtualFileSystem(ordered, inflate);
  }

  /** Finds a file in search order, or null when no source has it. */
  find(path: string): VfsHit | null {
    const wanted = normalizeVfsPath(path);
    for (const source of this.ordered) {
      if (source.type === 'loose') {
        const bytes = source.files.get(wanted);
        if (bytes) {
          return {
            size: bytes.size,
            source: { kind: 'loose', gameDir: source.gameDir },
            read: () => bytes.read(0, bytes.size),
          };
        }
      } else {
        const entry = source.pack.entries.get(wanted);
        if (entry) {
          const pack = source.pack;
          return {
            size: 'uncompressedSize' in entry ? entry.uncompressedSize : entry.length,
            source: { kind: 'pack', gameDir: pack.gameDir, packFile: pack.packFile },
            read: async () => {
              if (pack.kind === 'pak') {
                const pakEntry = pack.entries.get(wanted)!;
                return pack.source.read(pakEntry.offset, pakEntry.length);
              }
              const pkzEntry = pack.entries.get(wanted)!;
              return readPkzFile(pack.source, pkzEntry, this.inflate);
            },
          };
        }
      }
    }
    return null;
  }

  /** Reads a file in search order, or null when no source has it. */
  async readFile(path: string): Promise<Uint8Array | null> {
    const hit = this.find(path);
    return hit ? hit.read() : null;
  }

  /**
   * The texture index: map-style texture names (without the textures/
   * prefix and the .wal extension) to the source that serves them, in
   * search order, so shadowed textures point at their winning source.
   */
  textureIndex(): Map<string, VfsSource> {
    const index = new Map<string, VfsSource>();
    // later sources lose, so fill in reverse order and let earlier overwrite
    for (const source of [...this.ordered].reverse()) {
      if (source.type === 'loose') {
        for (const path of source.files.keys()) {
          const name = textureNameOf(path);
          if (name) {
            index.set(name, { kind: 'loose', gameDir: source.gameDir });
          }
        }
      } else {
        for (const path of source.pack.entries.keys()) {
          const name = textureNameOf(path);
          if (name) {
            index.set(name, {
              kind: 'pack',
              gameDir: source.pack.gameDir,
              packFile: source.pack.packFile,
            });
          }
        }
      }
    }
    return index;
  }
}

function textureNameOf(path: string): string | null {
  if (!path.startsWith('textures/') || !path.endsWith('.wal')) {
    return null;
  }
  return path.slice('textures/'.length, -'.wal'.length);
}
