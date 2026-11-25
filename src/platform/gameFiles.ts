import type { ByteSource } from '@core/types/index';
import type { GameDirKind } from '@game/q2/index';
import { BASE_GAME_DIR } from '@game/q2/index';
import type { VfsDirectoryInput } from './vfs';

export interface GameFileEntry {
  /** Path relative to the game root the user picked, lowercase or not. */
  path: string;
  source: ByteSource;
}

/**
 * Groups the files of a picked directory tree into the mod and baseq2
 * inputs of the virtual filesystem. Files outside the two game
 * directories are ignored. Paths are normalised to lowercase forward
 * slashes, and pack files are separated from loose files.
 */
export function groupGameFiles(
  entries: GameFileEntry[],
  modDir: string | null,
): Map<GameDirKind, VfsDirectoryInput> {
  const result = new Map<GameDirKind, VfsDirectoryInput>();
  for (const gameDir of ['baseq2', ...(modDir ? ['mod' as const] : [])] as GameDirKind[]) {
    result.set(gameDir, { gameDir, loose: new Map(), packs: new Map() });
  }
  const modPrefix = modDir ? `${modDir.toLowerCase()}/` : null;

  for (const entry of entries) {
    const path = entry.path.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
    let gameDir: GameDirKind;
    let rest: string;
    if (path.startsWith(`${BASE_GAME_DIR}/`)) {
      gameDir = 'baseq2';
      rest = path.slice(BASE_GAME_DIR.length + 1);
    } else if (modPrefix && path.startsWith(modPrefix)) {
      gameDir = 'mod';
      rest = path.slice(modPrefix.length);
    } else {
      continue;
    }
    const input = result.get(gameDir)!;
    // pack files sit at the root of the game directory
    if (!rest.includes('/') && (rest.endsWith('.pak') || rest.endsWith('.pkz'))) {
      // the search order matches names case-insensitively but sorts by the
      // original case-insensitive comparison either way
      input.packs.set(rest, entry.source);
    } else {
      input.loose.set(rest, entry.source);
    }
  }
  return result;
}
