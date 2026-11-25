import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { runQbsp3Oracle, expectCleanQbsp3 } from './runQbsp3';

/**
 * Gate 4: the self-made single-player sample compiles without warnings.
 * The .bsp is written for the manual q2pro playthrough.
 */
describe('sp-sample gate compile', () => {
  it('compiles without warnings into a valid bsp', async () => {
    const mapText = readFileSync('tests/fixtures/maps/sp-sample.map', 'utf8');
    const result = await runQbsp3Oracle(mapText, 'sp-sample', ['e2u1/mine10_1']);
    expectCleanQbsp3(result);
    mkdirSync('tests/fixtures/generated', { recursive: true });
    writeFileSync('tests/fixtures/generated/sp-sample.bsp', result.bsp);
    expect(result.bsp.byteLength).toBeGreaterThan(1024);
  });

  it('contains the gate actors: start, door, button, monster', () => {
    const text = readFileSync('tests/fixtures/maps/sp-sample.map', 'utf8');
    expect(text).toContain('"classname" "info_player_start"');
    expect(text).toContain('"classname" "func_door"');
    expect(text).toContain('"targetname" "door1"');
    expect(text).toContain('"classname" "func_button"');
    expect(text).toContain('"target" "door1"');
    expect(text).toContain('"classname" "monster_soldier"');
  });
});
