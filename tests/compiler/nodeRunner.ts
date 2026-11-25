import type { CompileRunner } from '../../src/app/compile';

interface CompileModule {
  FS: {
    mkdir(path: string): void;
    writeFile(path: string, data: string | Uint8Array): void;
    readFile(path: string): Uint8Array;
  };
  callMain(args: string[]): void;
}

/** Runs the real wasm modules in Node, mirroring the worker exactly. */
export const nodeRunner: CompileRunner = async (step) => {
  const create = (await import(`../../public/wasm/${step.tool}.mjs`)).default as (options: {
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
