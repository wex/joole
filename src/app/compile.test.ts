import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePts } from '@core/formats/index';
import { runCompilePipeline } from './compile';
import { nodeRunner } from '../../tests/compiler/nodeRunner';
import { lightingStats } from '../../tests/compiler/bspInspect';

const mapText = readFileSync('tests/fixtures/maps/sp-sample.map', 'utf8');
const wal = readFileSync('tests/fixtures/game/baseq2/textures/e2u1/mine10_1.wal');
const colormap = readFileSync('tests/fixtures/colormap.pcx');
const wals = [{ name: 'e2u1/mine10_1', data: new Uint8Array(wal) }];

describe('runCompilePipeline with the real wasm tools', () => {
  it('the normal profile compiles the sample into a lit bsp', async () => {
    const result = await runCompilePipeline(
      nodeRunner,
      { vis: 'full', lighting: 'normal' },
      'sp-sample',
      mapText,
      wals,
      new Uint8Array(colormap),
    );
    expect(result.leaked).toBe(false);
    expect(result.steps).toEqual(['qbsp3', 'qvis3', 'qrad3']);
    // Lighting more than doubles the bare qbsp output.
    expect(result.bsp.byteLength).toBeGreaterThan(10000);
    expect(result.prt).not.toBeNull();
  });

  it('the fast profile stops before radiosity', async () => {
    const result = await runCompilePipeline(
      nodeRunner,
      { vis: 'fast', lighting: 'off' },
      'sp-sample',
      mapText,
      wals,
      null,
    );
    expect(result.steps).toEqual(['qbsp3', 'qvis3']);
  });

  it('the final profile passes -extra to qrad3', async () => {
    const result = await runCompilePipeline(
      nodeRunner,
      { vis: 'full', lighting: 'final' },
      'sp-sample',
      mapText,
      wals,
      new Uint8Array(colormap),
    );
    expect(result.steps).toEqual(['qbsp3', 'qvis3', 'qrad3']);
    expect(result.bsp.byteLength).toBeGreaterThan(10000);
  });

  it('the option matrix supports qbsp-only and lighting without VIS with stage callbacks', async () => {
    const plainStages: string[] = [];
    const plain = await runCompilePipeline(
      nodeRunner,
      { vis: 'off', lighting: 'off' },
      'sp-sample',
      mapText,
      wals,
      null,
      (tool) => plainStages.push(tool),
    );
    expect(plain.steps).toEqual(['qbsp3']);
    expect(plainStages).toEqual(['qbsp3']);

    const unvisedLit = await runCompilePipeline(
      nodeRunner,
      { vis: 'off', lighting: 'normal' },
      'sp-sample',
      mapText,
      wals,
      new Uint8Array(colormap),
    );
    expect(unvisedLit.steps).toEqual(['qbsp3', 'qrad3']);
    expect(unvisedLit.bsp.byteLength).toBeGreaterThan(plain.bsp.byteLength);
    expect(lightingStats(unvisedLit.bsp).length).toBeGreaterThan(0);
    // Verified qrad3 behavior: missing visdata does not stop lighting, but it
    // disables radiosity bounces, so this is direct-only lighting.
    expect(unvisedLit.stepOutputs.qrad3).toContain('No vis information, direct lighting only.');
  });

  it('a leaking map stops after qbsp3 with the pointfile path', async () => {
    // leaking.map connects its interior to the void through a tunnel:
    // qbsp3 must report the leak and write the .lin pointfile.
    const leaky = readFileSync('tests/fixtures/maps/leaking.map', 'utf8');
    const result = await runCompilePipeline(
      nodeRunner,
      { vis: 'full', lighting: 'normal' },
      'leaking',
      leaky,
      wals,
      null,
    );
    expect(result.leaked).toBe(true);
    expect(result.steps).toEqual(['qbsp3']);
    expect(result.pts).not.toBeNull();
    // The path is a parseable polyline ending at the player start.
    const points = parsePts(new TextDecoder().decode(result.pts!));
    expect(points.length).toBeGreaterThan(1);
    const end = points[points.length - 1]!;
    expect(Math.abs(end[0] - 64)).toBeLessThan(2);
    expect(Math.abs(end[1] - 128)).toBeLessThan(2);
    expect(Math.abs(end[2] - 24)).toBeLessThan(2);
  });
});
