/**
 * The package search order as a pure function, after q2pro's add_game_dir
 * and pakcmp (ext/q2pro/src/common/files.c, verified on 24.11.2026).
 *
 * Packages whose name starts with "pak" (case-insensitive) sort first in
 * numerical order of the digits after "pak", the rest in case-insensitive
 * alphabetical order. The lookup runs in reverse, so the package sorted
 * last is searched first. Mod entries come before baseq2 entries, and
 * within one game directory the packages come before the loose files.
 */

export type GameDirKind = 'mod' | 'baseq2';

export type SearchEntry =
  { kind: 'pack'; gameDir: GameDirKind; file: string } | { kind: 'dir'; gameDir: GameDirKind };

function startsWithPak(name: string): boolean {
  return name.slice(0, 3).toLowerCase() === 'pak';
}

/** strtoul on the characters after "pak": leading digits, or 0. */
function pakNumber(name: string): number {
  const match = /^\d+/.exec(name.slice(3));
  return match ? parseInt(match[0], 10) : 0;
}

function alphaCmp(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la < lb) {
    return -1;
  }
  if (la > lb) {
    return 1;
  }
  return 0;
}

/** q2pro's pakcmp: ascending sort order for pack file names. */
export function pakcmp(a: string, b: string): number {
  const aPak = startsWithPak(a);
  const bPak = startsWithPak(b);
  if (aPak && bPak) {
    const na = pakNumber(a);
    const nb = pakNumber(b);
    if (na !== nb) {
      return na - nb;
    }
    return alphaCmp(a, b);
  }
  if (aPak) {
    return -1;
  }
  if (bPak) {
    return 1;
  }
  return alphaCmp(a, b);
}

function isPackFile(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.pak') || lower.endsWith('.pkz');
}

export interface SearchOrderInput {
  /** File names in the baseq2 directory. */
  baseFiles: string[];
  /** File names in the mod directory, or null when no mod is in use. */
  modFiles?: string[] | null;
}

/**
 * The ordered search path, first searched first. The file names are the
 * directory's entries, from which the pack files are picked; everything
 * else is loose content found through the directory entry.
 */
export function searchOrder(input: SearchOrderInput): SearchEntry[] {
  const result: SearchEntry[] = [];
  const dirs: { gameDir: GameDirKind; files: string[] }[] = [];
  if (input.modFiles) {
    dirs.push({ gameDir: 'mod', files: input.modFiles });
  }
  dirs.push({ gameDir: 'baseq2', files: input.baseFiles });

  for (const { gameDir, files } of dirs) {
    const packs = files.filter(isPackFile).sort(pakcmp);
    // the lookup runs in reverse order: the package sorted last goes first
    for (let i = packs.length - 1; i >= 0; i--) {
      result.push({ kind: 'pack', gameDir, file: packs[i]! });
    }
    result.push({ kind: 'dir', gameDir });
  }
  return result;
}
