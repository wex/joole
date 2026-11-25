import { describe, expect, it } from 'vitest';
import type { ByteSource } from '@core/types/index';
import { groupGameFiles } from './gameFiles';

function mem(): ByteSource {
  return { size: 0, read: () => Promise.resolve(new Uint8Array()) };
}

function entry(path: string) {
  return { path, source: mem() };
}

describe('groupGameFiles', () => {
  it('separates packs and loose files per game directory', () => {
    const groups = groupGameFiles(
      [
        entry('baseq2/pak0.pak'),
        entry('baseq2/textures/e2u1/mine10_1.wal'),
        entry('mymod/pak0.pkz'),
        entry('mymod/maps/x.map'),
        entry('unrelated/readme.txt'),
      ],
      'mymod',
    );
    const base = groups.get('baseq2')!;
    expect([...base.packs.keys()]).toEqual(['pak0.pak']);
    expect([...base.loose.keys()]).toEqual(['textures/e2u1/mine10_1.wal']);
    const mod = groups.get('mod')!;
    expect([...mod.packs.keys()]).toEqual(['pak0.pkz']);
    expect([...mod.loose.keys()]).toEqual(['maps/x.map']);
  });

  it('normalises case and backslashes', () => {
    const groups = groupGameFiles([entry('BaseQ2\\PAK0.PAK')], null);
    expect([...groups.get('baseq2')!.packs.keys()]).toEqual(['pak0.pak']);
  });

  it('works without a mod', () => {
    const groups = groupGameFiles([entry('baseq2/pak0.pak')], null);
    expect(groups.has('mod')).toBe(false);
  });

  it('nested .pak files are loose content, not packs', () => {
    const groups = groupGameFiles([entry('baseq2/subdir/pak0.pak')], null);
    expect(groups.get('baseq2')!.packs.size).toBe(0);
    expect(groups.get('baseq2')!.loose.size).toBe(1);
  });
});
