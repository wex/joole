import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePts } from '@core/formats/index';
import { runCompilePipeline, type CompileRunner } from './compile';

interface CompileModule {
  FS: {
    mkdir(path: string): void;
    writeFile(path: string, data: string | Uint8Array): void;
    readFile(path: string): Uint8Array;
  };
  callMain(args: string[]): void;
}

/** Runs the real wasm modules in Node, mirroring the worker exactly. */
const nodeRunner: CompileRunner = async (step) => {
  const create = (await import(`../../workers/wasm/${step.tool}.mjs`)).default as (options: {
    print(text: string): void;
    printErr(text: string): void;
  }) => Promise<CompileModule>;
  const module = await create({ print: () => {}, printErr: () => {} });
  const dirs = new Set<string>();
  for (const file of [...step.files.map((f) => f.path), ...step.outputs]) {
    const parts = file.split('/').filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      dirs.add('/' + parts.slice(0, i).join('/'));
    }
  }
  for (const dir of [...dirs].sort()) {
    try {
      module.FS.mkdir(dir);
    } catch {
      // exists
    }
  }
  for (const file of step.files) {
    module.FS.writeFile(file.path, file.data);
  }
  module.callMain([...step.args]);
  const files: { path: string; data: Uint8Array }[] = [];
  for (const path of step.outputs) {
    try {
      files.push({ path, data: module.FS.readFile(path) });
    } catch {
      // missing output
    }
  }
  return { files };
};

const mapText = readFileSync('tests/fixtures/maps/sp-sample.map', 'utf8');
const wal = readFileSync('tests/fixtures/game/baseq2/textures/e2u1/mine10_1.wal');
const colormap = readFileSync('tests/fixtures/colormap.pcx');
const wals = [{ name: 'e2u1/mine10_1', data: new Uint8Array(wal) }];

describe('runCompilePipeline with the real wasm tools', () => {
  it('the normal profile compiles the sample into a lit bsp', async () => {
    const result = await runCompilePipeline(
      nodeRunner,
      'normal',
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
    const result = await runCompilePipeline(nodeRunner, 'fast', 'sp-sample', mapText, wals, null);
    expect(result.steps).toEqual(['qbsp3', 'qvis3']);
  });

  it('the final profile passes -extra to qrad3', async () => {
    const result = await runCompilePipeline(
      nodeRunner,
      'final',
      'sp-sample',
      mapText,
      wals,
      new Uint8Array(colormap),
    );
    expect(result.steps).toEqual(['qbsp3', 'qvis3', 'qrad3']);
    expect(result.bsp.byteLength).toBeGreaterThan(10000);
  });

  it('a leaking map stops after qbsp3 with the pointfile path', async () => {
    // leaking.map connects its interior to the void through a tunnel:
    // qbsp3 must report the leak and write the .lin pointfile.
    const leaky = readFileSync('tests/fixtures/maps/leaking.map', 'utf8');
    const result = await runCompilePipeline(nodeRunner, 'normal', 'leaking', leaky, wals, null);
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
