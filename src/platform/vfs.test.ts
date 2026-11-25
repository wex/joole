import { describe, expect, it } from 'vitest';
import type { ByteSource } from '@core/types/index';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { VirtualFileSystem, normalizeVfsPath } from './vfs';

function mem(bytes: Uint8Array): ByteSource {
  return {
    size: bytes.byteLength,
    read: (offset, length) => Promise.resolve(bytes.slice(offset, offset + length)),
  };
}

function fixture(name: string): ByteSource {
  return mem(new Uint8Array(readFileSync(`tests/fixtures/${name}`)));
}

function text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

const inflate = (data: Uint8Array) => Promise.resolve(new Uint8Array(inflateRawSync(data)));

function baseInput() {
  return {
    gameDir: 'baseq2' as const,
    loose: new Map([['textures/e2u1/looseonly.wal', mem(new TextEncoder().encode('loose base'))]]),
    packs: new Map([['pak0.pak', fixture('textures.pak')]]),
  };
}

function modInput() {
  return {
    gameDir: 'mod' as const,
    loose: new Map<string, ByteSource>(),
    packs: new Map([['pak0.pkz', fixture('modtex.pkz')]]),
  };
}

describe('VirtualFileSystem', () => {
  it('a mod texture shadows the baseq2 texture', async () => {
    const vfs = await VirtualFileSystem.open([modInput(), baseInput()], inflate);
    const hit = vfs.find('textures/e2u1/mine10_1.wal');
    expect(hit).not.toBeNull();
    expect(text(await hit!.read())).toBe('mod texture');
    expect(hit!.source).toEqual({ kind: 'pack', gameDir: 'mod', packFile: 'pak0.pkz' });
  });

  it('baseq2 textures resolve when the mod does not have them', async () => {
    const vfs = await VirtualFileSystem.open([modInput(), baseInput()], inflate);
    const hit = vfs.find('textures/e2u1/mine10_2.wal');
    expect(text(await hit!.read())).toBe('another base texture');
    expect(hit!.source).toEqual({ kind: 'pack', gameDir: 'baseq2', packFile: 'pak0.pak' });
  });

  it('pack files beat loose files of the same game directory', async () => {
    const input = baseInput();
    input.loose.set('textures/e2u1/mine10_1.wal', mem(new TextEncoder().encode('loose shadowed')));
    const vfs = await VirtualFileSystem.open([input], inflate);
    const hit = vfs.find('textures/e2u1/mine10_1.wal');
    expect(text(await hit!.read())).toBe('base texture');
  });

  it('loose files resolve when no pack has them', async () => {
    const vfs = await VirtualFileSystem.open([baseInput()], inflate);
    const hit = vfs.find('textures/e2u1/looseonly.wal');
    expect(hit!.source.kind).toBe('loose');
    expect(text(await hit!.read())).toBe('loose base');
  });

  it('lookups are case-insensitive and accept backslashes', async () => {
    const vfs = await VirtualFileSystem.open([baseInput()], inflate);
    expect(vfs.find('Textures\\E2U1\\MINE10_1.WAL')).not.toBeNull();
    expect(normalizeVfsPath('/A\\b/C')).toBe('a/b/c');
  });

  it('a later-numbered pak shadows an earlier one', async () => {
    const input = baseInput();
    input.packs = new Map([
      ['pak0.pak', fixture('textures.pak')],
      ['pak1.pak', fixture('tiny.pak')],
    ]);
    const vfs = await VirtualFileSystem.open([input], inflate);
    // tiny.pak has test/hello.txt and pak1 is searched first
    const hit = vfs.find('test/hello.txt');
    expect(hit!.source).toEqual({ kind: 'pack', gameDir: 'baseq2', packFile: 'pak1.pak' });
    expect(text(await hit!.read())).toBe('hello pak\n');
  });

  it('the texture index points shadowed textures at their winning source', async () => {
    const vfs = await VirtualFileSystem.open([modInput(), baseInput()], inflate);
    const index = vfs.textureIndex();
    expect(index.get('e2u1/mine10_1')).toEqual({
      kind: 'pack',
      gameDir: 'mod',
      packFile: 'pak0.pkz',
    });
    expect(index.get('e2u1/mine10_2')).toEqual({
      kind: 'pack',
      gameDir: 'baseq2',
      packFile: 'pak0.pak',
    });
    expect(index.get('e2u1/looseonly')).toEqual({ kind: 'loose', gameDir: 'baseq2' });
  });

  it('returns null for missing files', async () => {
    const vfs = await VirtualFileSystem.open([baseInput()], inflate);
    expect(vfs.find('textures/nope.wal')).toBeNull();
    expect(await vfs.readFile('textures/nope.wal')).toBeNull();
  });
});
