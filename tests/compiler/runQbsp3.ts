import { readFileSync } from 'node:fs';

export interface Qbsp3Result {
  readonly output: string;
  readonly bsp: Uint8Array;
}

interface QbspModule {
  FS: {
    mkdir(path: string): void;
    writeFile(path: string, data: string | Uint8Array): void;
    readFile(path: string): Uint8Array;
  };
  callMain(args: string[]): void;
}

/** Runs a fresh qbsp3 wasm instance in Node with synthetic .wal headers. */
export async function runQbsp3Oracle(
  mapText: string,
  mapName: string,
  textureNames: readonly string[],
): Promise<Qbsp3Result> {
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
    ...new Set(textureNames.map((name) => `/quake2/baseq2/textures/${name.split('/')[0]}`)),
  ]) {
    module.FS.mkdir(dir);
  }
  module.FS.writeFile(`/quake2/baseq2/maps/${mapName}.map`, mapText);
  const wal = readFileSync('tests/fixtures/game/baseq2/textures/e2u1/mine10_1.wal');
  for (const name of textureNames) {
    module.FS.writeFile(`/quake2/baseq2/textures/${name}.wal`, wal);
  }
  module.callMain([`/quake2/baseq2/maps/${mapName}.map`]);
  return { output, bsp: module.FS.readFile(`/quake2/baseq2/maps/${mapName}.bsp`) };
}

export function expectCleanQbsp3(result: Qbsp3Result): void {
  if (/Entity \d+, Brush \d+:/i.test(result.output)) {
    throw new Error(`qbsp3 brush warning:\n${result.output}`);
  }
  if (/microbrush|leak/i.test(result.output)) {
    throw new Error(`qbsp3 geometry failure:\n${result.output}`);
  }
  if (result.bsp.byteLength <= 1024) {
    throw new Error('qbsp3 produced an implausibly small BSP');
  }
}
