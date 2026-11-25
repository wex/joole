import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface QbspModule {
  FS: {
    mkdir(path: string): void;
    writeFile(path: string, data: string | Uint8Array): void;
    readFile(path: string): Uint8Array;
  };
  callMain(args: string[]): void;
}

describe('qbsp3 wasm oracle', () => {
  it('compiles the sealed room fixture without brush warnings or leaks', async () => {
    const create = (await import('../../workers/wasm/qbsp3.mjs')).default as (options: {
      print(text: string): void;
      printErr(text: string): void;
    }) => Promise<QbspModule>;
    let output = '';
    const module = await create({
      print: (text) => (output += `${text}\n`),
      printErr: (text) => (output += `${text}\n`),
    });
    for (const dir of [
      '/quake2',
      '/quake2/baseq2',
      '/quake2/baseq2/maps',
      '/quake2/baseq2/textures',
      '/quake2/baseq2/textures/e2u1',
      '/quake2/baseq2/textures/e1u1',
    ]) {
      module.FS.mkdir(dir);
    }
    module.FS.writeFile(
      '/quake2/baseq2/maps/room.map',
      readFileSync('tests/fixtures/room.map', 'utf8'),
    );
    const wal = readFileSync('tests/fixtures/game/baseq2/textures/e2u1/mine10_1.wal');
    for (const name of ['e2u1/mine10_1', 'e2u1/mine10_2', 'e2u1/glass', 'e1u1/sky1', 'e1u1/clip']) {
      module.FS.writeFile(`/quake2/baseq2/textures/${name}.wal`, wal);
    }
    module.callMain(['/quake2/baseq2/maps/room.map']);
    expect(output).not.toMatch(/Entity \d+, Brush \d+:/i);
    expect(output).not.toMatch(/microbrush|leak/i);
    expect(module.FS.readFile('/quake2/baseq2/maps/room.bsp').byteLength).toBeGreaterThan(1024);
  });
});
