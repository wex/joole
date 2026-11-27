import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseQuakedBlocks } from '@core/formats/index';
import { entityCreationDefaults, withQ2EntityMetadata } from './entityMetadata';
import { CLASS_MODELS } from './models';

describe('generated entity definitions', () => {
  const defs = parseQuakedBlocks(readFileSync('src/game/q2/q2.def', 'utf8'));
  const byName = new Map(defs.map((def) => [def.className, def]));

  it('parses every vanilla class', () => {
    // 148 QUAKED blocks in the vanilla game code (release 3.21).
    expect(defs.length).toBe(148);
  });

  it('has no duplicate class names', () => {
    expect(byName.size).toBe(defs.length);
  });

  it('covers the core single-player classes', () => {
    for (const name of [
      'worldspawn',
      'info_player_start',
      'func_door',
      'func_button',
      'trigger_once',
      'trigger_multiple',
      'monster_soldier',
      'light',
    ]) {
      expect(byName.has(name), name).toBe(true);
    }
  });

  it('every class has a colour and either a box or the brush marker', () => {
    for (const def of defs) {
      expect(def.color.every((c) => c >= 0 && c <= 1)).toBe(true);
      if (def.bbox !== 'brush') {
        expect(def.bbox.mins.length).toBe(3);
        expect(def.bbox.maxs.length).toBe(3);
      }
    }
  });

  it('creation defaults use implementation-verified values, not stale QUAKED prose', () => {
    const withMeta = withQ2EntityMetadata(defs);
    expect(entityCreationDefaults(withMeta, 'light')).toEqual([
      ['light', '300'],
      ['_color', '1 1 1'],
      ['style', '0'],
      ['_cone', '10'],
    ]);
    // func_button's QUAKED text says wait 1, but release 3.21 uses 3.
    expect(entityCreationDefaults(withMeta, 'func_button')).toEqual([
      ['speed', '40'],
      ['wait', '3'],
      ['lip', '4'],
    ]);
    const button = withMeta.find((def) => def.className === 'func_button')!;
    expect(button.keys.find((key) => key.name === 'wait')?.defaultValue).toBe('3');
    const plat = withMeta.find((def) => def.className === 'func_plat')!;
    expect(plat.keys.find((key) => key.name === 'accel')?.defaultValue).toBe('50');
    // func_plat's documented accel 500 is not equivalent to the engine's
    // fallback after scaling, so it is only a panel hint and is not written.
    expect(entityCreationDefaults(withMeta, 'func_plat').some(([key]) => key === 'accel')).toBe(
      false,
    );
  });

  it('model table references only models/*.md2 paths', () => {
    for (const [cls, model] of Object.entries(CLASS_MODELS)) {
      expect(model, cls).toMatch(/^models\/.+\.md2$/);
    }
  });

  it('model table covers the common monsters and items', () => {
    for (const name of [
      'monster_soldier',
      'monster_infantry',
      'monster_tank',
      'item_health_large',
      'item_armor_body',
      'weapon_shotgun',
    ]) {
      expect(CLASS_MODELS[name], name).toBeDefined();
    }
  });

  it('every model table key is a defined class', () => {
    for (const cls of Object.keys(CLASS_MODELS)) {
      expect(byName.has(cls), cls).toBe(true);
    }
  });
});
