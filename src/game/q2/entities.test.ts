import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseQuakedBlocks } from '@core/formats/index';
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
