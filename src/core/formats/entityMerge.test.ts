import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mergeEntityDefs, parseQuakedBlocks } from './index';

describe('mergeEntityDefs', () => {
  const vanilla = parseQuakedBlocks(readFileSync('src/game/q2/q2.def', 'utf8'));
  const ctf = parseQuakedBlocks(readFileSync('tests/fixtures/quaked/ctf-blocks.c', 'utf8'));

  it('adds mod classes to the vanilla set', () => {
    const merged = mergeEntityDefs(vanilla, ctf);
    const names = new Set(merged.map((def) => def.className));
    expect(names.has('info_player_team1')).toBe(true);
    expect(names.has('misc_ctf_banner')).toBe(true);
    expect(names.has('monster_soldier')).toBe(true);
    expect(merged.length).toBe(vanilla.length + ctf.length);
  });

  it('a mod class overrides the vanilla class of the same name', () => {
    const override = parseQuakedBlocks('/*QUAKED func_door (1 0 1) ? Custom\nmod variant\n*/');
    const merged = mergeEntityDefs(vanilla, override);
    const door = merged.find((def) => def.className === 'func_door')!;
    expect(door.color).toEqual([1, 0, 1]);
    expect(door.spawnflags).toEqual(['Custom']);
    // Vanilla documented keys survive a mod override unless the mod replaces
    // that key explicitly.
    expect(door.keys.length).toBeGreaterThan(0);
    // No duplicates.
    expect(merged.filter((def) => def.className === 'func_door').length).toBe(1);
    expect(merged.length).toBe(vanilla.length);
  });

  it('keeps the vanilla order, overriding in place and appending new classes', () => {
    const override = parseQuakedBlocks(
      '/*QUAKED func_door (1 0 0) ?\nmod door\n*/\n/*QUAKED zzz_new (0 0 0) ?\nnew\n*/',
    );
    const merged = mergeEntityDefs(vanilla, override);
    const doorIndex = merged.findIndex((def) => def.className === 'func_door');
    const vanillaDoorIndex = vanilla.findIndex((def) => def.className === 'func_door');
    expect(doorIndex).toBe(vanillaDoorIndex);
    expect(merged[merged.length - 1]!.className).toBe('zzz_new');
  });
});
