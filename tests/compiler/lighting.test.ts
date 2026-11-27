import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runCompilePipeline, type PipelineResult } from '../../src/app/compile';
import { bspLump, entityTextOf, lightingStats, texinfoOf } from './bspInspect';
import { nodeRunner } from './nodeRunner';

const sampleText = readFileSync('tests/fixtures/maps/sp-sample.map', 'utf8');
const sampleWal = new Uint8Array(
  readFileSync('tests/fixtures/game/baseq2/textures/e2u1/mine10_1.wal'),
);
const colormap = new Uint8Array(readFileSync('tests/fixtures/colormap.pcx'));

function compileSample(
  mapText: string,
  name: string,
  wal: Uint8Array = sampleWal,
): Promise<PipelineResult> {
  return runCompilePipeline(
    nodeRunner,
    { vis: 'fast', lighting: 'normal' },
    name,
    mapText,
    [{ name: 'e2u1/mine10_1', data: wal }],
    colormap,
  );
}

/** Removes the two point-light entities; they have no brush children. */
function withoutPointLights(mapText: string): string {
  return mapText.replace(/\{\s*"classname" "light"\s*\n(?:[^\n]*\n)*?\}\s*\n/g, '');
}

function lightingBytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  const al = bspLump(a, 7).bytes;
  const bl = bspLump(b, 7).bytes;
  return al.length === bl.length && al.every((byte, index) => byte === bl[index]);
}

function withLightKey(mapText: string, key: string, value: string): string {
  return mapText.replaceAll('"classname" "light"\n', `"classname" "light"\n"${key}" "${value}"\n`);
}

function withSurfaceAttributes(mapText: string): string {
  return mapText.replaceAll('e2u1/mine10_1 0 0 0 1 1\n', 'e2u1/mine10_1 0 0 0 1 1 0 1 300\n');
}

function walWithSurfaceLight(flags: number, value: number): Uint8Array {
  const wal = sampleWal.slice();
  const view = new DataView(wal.buffer, wal.byteOffset, wal.byteLength);
  view.setInt32(88, flags, true);
  view.setInt32(96, value, true);
  return wal;
}

describe('qrad3 lighting reproduction', () => {
  it('uses the default intensity of point lights and changes the lightmap', async () => {
    expect(withoutPointLights(sampleText)).not.toContain('"classname" "light"');
    const unlit = await compileSample(withoutPointLights(sampleText), 'light-none');
    const lit = await compileSample(sampleText, 'light-default');
    const unlitStats = lightingStats(unlit.bsp);
    const litStats = lightingStats(lit.bsp);

    expect(entityTextOf(lit.bsp)).toContain('"classname" "light"');
    expect(litStats.length).toBeGreaterThan(0);
    // Lighting is not brightness-monotonic because occlusion and shadowing
    // redistribute samples, so the controlled assertion is binary difference.
    expect(lightingStats(lit.bsp)).not.toEqual(unlitStats);

    const dim = await compileSample(withLightKey(sampleText, 'light', '100'), 'light-dim');
    expect(lightingStats(dim.bsp)).not.toEqual(litStats);
    expect(lit.stepOutputs.qrad3).toContain('reading /quake2/baseq2/maps/light-default.bsp');

    // `_light` is the legacy alias qrad3 falls back to when `light` is absent.
    const legacyDim = await compileSample(
      withLightKey(sampleText, '_light', '100'),
      'light-dim-alias',
    );
    expect(lightingBytesEqual(legacyDim.bsp, dim.bsp)).toBe(true);
  }, 30000);

  it('normalizes light colors so scale-invariant colors produce identical lightmaps', async () => {
    const white = await compileSample(withLightKey(sampleText, '_color', '1 1 1'), 'light-white');
    const scaled = await compileSample(
      withLightKey(sampleText, '_color', '0.5 0.5 0.5'),
      'light-scaled',
    );
    const red = await compileSample(withLightKey(sampleText, '_color', '1 0 0'), 'light-red');

    // qrad3's ColorNormalize scales the largest component to one before the
    // light intensity is applied. Halving all three components therefore does
    // not halve brightness; it is the same color as 1 1 1.
    expect(lightingBytesEqual(scaled.bsp, white.bsp)).toBe(true);
    expect(lightingBytesEqual(red.bsp, white.bsp)).toBe(false);
  }, 45000);

  it('treats target-aimed lights as spotlights using the default cone', async () => {
    const targeted = sampleText
      .replace(
        '"classname" "light"\n"origin" "128 128 96"',
        '"classname" "light"\n"target" "spotgoal"\n"origin" "128 128 96"',
      )
      .replace(
        '{\n"classname" "info_player_start"',
        '{\n"classname" "info_null"\n"targetname" "spotgoal"\n"origin" "128 128 0"\n}\n{\n"classname" "info_player_start"',
      );
    const spot = await compileSample(targeted, 'light-spot');
    const point = await compileSample(sampleText, 'light-point-control');

    expect(entityTextOf(spot.bsp)).toContain('"target" "spotgoal"');
    expect(lightingStats(spot.bsp)).not.toEqual(lightingStats(point.bsp));

    const narrow = await compileSample(withLightKey(targeted, '_cone', '5'), 'light-spot-narrow');
    expect(lightingStats(narrow.bsp)).not.toEqual(lightingStats(spot.bsp));
  }, 30000);

  it('carries explicit SURF_LIGHT face attributes through qbsp3 into qrad3', async () => {
    const surface = await compileSample(withSurfaceAttributes(sampleText), 'light-surface');
    const plain = await compileSample(sampleText, 'light-surface-control');
    const emitting = texinfoOf(surface.bsp).filter((info) => (info.flags & 1) !== 0);

    expect(emitting.length).toBeGreaterThan(0);
    expect(emitting.some((info) => info.value === 300)).toBe(true);
    expect(lightingStats(surface.bsp)).not.toEqual(lightingStats(plain.bsp));

    const dimmerSurfaceText = withSurfaceAttributes(sampleText).replaceAll(
      ' 0 1 300\n',
      ' 0 1 180\n',
    );
    const dimmer = await compileSample(dimmerSurfaceText, 'light-surface-dim');
    expect(lightingStats(dimmer.bsp)).not.toEqual(lightingStats(surface.bsp));
    expect(lightingBytesEqual(dimmer.bsp, surface.bsp)).toBe(false);
  }, 30000);

  it('uses wal default SURF_LIGHT flags and value when the face has no override', async () => {
    const lightWal = walWithSurfaceLight(1, 180);
    const surface = await compileSample(sampleText, 'light-wal-default', lightWal);
    const emitting = texinfoOf(surface.bsp).filter((info) => (info.flags & 1) !== 0);

    expect(emitting.length).toBeGreaterThan(0);
    expect(emitting.every((info) => info.value === 180)).toBe(true);
    expect(lightingStats(surface.bsp).nonzero).toBeGreaterThan(0);
  }, 30000);
});
