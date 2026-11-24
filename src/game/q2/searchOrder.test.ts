import { describe, expect, it } from 'vitest';
import { pakcmp, searchOrder } from './searchOrder';
import type { SearchEntry } from './searchOrder';

function files(entries: SearchEntry[]): string[] {
  return entries.map((e) =>
    e.kind === 'pack' ? `pack:${e.gameDir}/${e.file}` : `dir:${e.gameDir}`,
  );
}

describe('pakcmp', () => {
  it('sorts pakN numerically, not lexically', () => {
    const sorted = ['pak17.pak', 'pak2.pak', 'pak0.pak', 'pak10.pak'].sort(pakcmp);
    expect(sorted).toEqual(['pak0.pak', 'pak2.pak', 'pak10.pak', 'pak17.pak']);
  });

  it('sorts pak files before named files', () => {
    const sorted = ['abc.pak', 'pak0.pak', 'zzz.pkz'].sort(pakcmp);
    expect(sorted).toEqual(['pak0.pak', 'abc.pak', 'zzz.pkz']);
  });

  it('named files sort case-insensitively', () => {
    const sorted = ['Beta.pak', 'alpha.pak'].sort(pakcmp);
    expect(sorted).toEqual(['alpha.pak', 'Beta.pak']);
  });

  it('a pak name without digits counts as number 0', () => {
    const sorted = ['pakfoo.pak', 'pak3.pak'].sort(pakcmp);
    expect(sorted).toEqual(['pakfoo.pak', 'pak3.pak']);
  });
});

describe('searchOrder', () => {
  it('matches vanilla FS_AddGameDirectory for pak0 to pak9: highest first', () => {
    const baseFiles = Array.from({ length: 10 }, (_, i) => `pak${i}.pak`);
    const order = searchOrder({ baseFiles });
    const packs = order
      .filter((e) => e.kind === 'pack')
      .map((e) => (e.kind === 'pack' ? e.file : ''));
    expect(packs).toEqual(Array.from({ length: 10 }, (_, i) => `pak${9 - i}.pak`));
    // loose files come after all packages
    expect(order[order.length - 1]).toEqual({ kind: 'dir', gameDir: 'baseq2' });
  });

  it('mixed pakN and named packs: reverse of the sorted order', () => {
    // sorted ascending: pak0, pak2, pak17, abc, xyz; lookup reverses it
    const order = searchOrder({
      baseFiles: ['xyz.pak', 'pak2.pak', 'abc.pak', 'pak17.pak', 'pak0.pak'],
    });
    expect(files(order)).toEqual([
      'pack:baseq2/xyz.pak',
      'pack:baseq2/abc.pak',
      'pack:baseq2/pak17.pak',
      'pack:baseq2/pak2.pak',
      'pack:baseq2/pak0.pak',
      'dir:baseq2',
    ]);
  });

  it('pkz files are packs too', () => {
    const order = searchOrder({ baseFiles: ['pak0.pkz', 'data.pak'] });
    expect(order.filter((e) => e.kind === 'pack')).toHaveLength(2);
  });

  it('matches names and extensions case-insensitively', () => {
    const order = searchOrder({ baseFiles: ['PAK0.PAK', 'Pak1.Pkz'] });
    expect(order.filter((e) => e.kind === 'pack')).toHaveLength(2);
    const packs = order
      .filter((e) => e.kind === 'pack')
      .map((e) => (e.kind === 'pack' ? e.file : ''));
    expect(packs[0]).toBe('Pak1.Pkz');
  });

  it('ignores files that are not packs', () => {
    const order = searchOrder({ baseFiles: ['readme.txt', 'pak0.pak', 'e2u1/mine10_1.wal'] });
    expect(order.filter((e) => e.kind === 'pack')).toHaveLength(1);
  });

  it('mod entries come before baseq2 entries', () => {
    const order = searchOrder({ modFiles: ['pak0.pak'], baseFiles: ['pak0.pak'] });
    expect(files(order)).toEqual([
      'pack:mod/pak0.pak',
      'dir:mod',
      'pack:baseq2/pak0.pak',
      'dir:baseq2',
    ]);
  });

  it('works without a mod', () => {
    const order = searchOrder({ modFiles: null, baseFiles: [] });
    expect(order).toEqual([{ kind: 'dir', gameDir: 'baseq2' }]);
  });
});
