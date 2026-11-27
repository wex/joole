import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { runQbsp3Oracle, expectCleanQbsp3 } from './runQbsp3';
import { runCompilePipeline } from '../../src/app/compile';
import { nodeRunner } from './nodeRunner';

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

  it('compiles through the full chain into the lit playthrough artifact', async () => {
    // The gate's manual step is played in q2pro, so the committed artifact is
    // the lit output of the whole chain, not the qbsp3-only intermediate.
    const text = readFileSync('tests/fixtures/maps/sp-sample.map', 'utf8');
    const wal = readFileSync('tests/fixtures/game/baseq2/textures/e2u1/mine10_1.wal');
    const colormap = readFileSync('tests/fixtures/colormap.pcx');
    const result = await runCompilePipeline(
      nodeRunner,
      { vis: 'full', lighting: 'normal' },
      'sp-sample',
      text,
      [{ name: 'e2u1/mine10_1', data: new Uint8Array(wal) }],
      new Uint8Array(colormap),
    );
    expect(result.leaked).toBe(false);
    expect(result.steps).toEqual(['qbsp3', 'qvis3', 'qrad3']);
    mkdirSync('tests/fixtures/generated', { recursive: true });
    writeFileSync('tests/fixtures/generated/sp-sample.bsp', result.bsp);
    expect(result.bsp.byteLength).toBeGreaterThan(10000);
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
