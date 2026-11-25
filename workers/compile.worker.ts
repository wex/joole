import type {
  CompileWorkerRequest as CompileRequest,
  CompileWorkerResponse as CompileResponse,
} from '../src/core/types/index';

/**
 * The compile worker: runs one of the Quake 2 compiler tools (qbsp3, qvis3,
 * qrad3) in its emscripten build. Files go into the in-memory filesystem,
 * stdout streams back line by line as it is produced, and the requested
 * output files come back as transferables. Cancellation is the client
 * terminating the worker: a wasm compile cannot be interrupted mid-run,
 * so every compile runs in a fresh worker.
 */
interface CompileModule {
  FS: {
    mkdir(path: string): void;
    writeFile(path: string, data: string | Uint8Array): void;
    readFile(path: string): Uint8Array;
  };
  callMain(args: string[]): void;
}

function respond(message: CompileResponse, transfer: Transferable[] = []): void {
  postMessage(message, { transfer });
}

/**
 * The threaded variants use emscripten pthreads over nested web workers with
 * a shared memory. They need cross-origin isolation (SharedArrayBuffer) and a
 * browser with nested workers; anything else falls back to the
 * single-threaded build, which the tools' threads.c then runs inline.
 */
function threadingAvailable(): boolean {
  return (
    typeof crossOriginIsolated !== 'undefined' &&
    crossOriginIsolated &&
    typeof SharedArrayBuffer !== 'undefined'
  );
}

/**
 * The emscripten modules load as static assets, not through the bundler: a
 * threaded module spawns its pthread workers from its own import.meta.url,
 * which only resolves when the file is served verbatim. Vite copies public/
 * untouched in both dev and production.
 */
async function loadTool(tool: CompileRequest['tool']): Promise<{
  default: (options: {
    print(t: string): void;
    printErr(t: string): void;
  }) => Promise<CompileModule>;
}> {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  let file = `${tool}.mjs`;
  if (tool !== 'qbsp3' && threadingAvailable()) {
    file = `${tool}t.mjs`;
  }
  return (await import(/* @vite-ignore */ `${base}wasm/${file}`)) as never;
}

onmessage = async (event: MessageEvent<CompileRequest>) => {
  const request = event.data;
  if (request.type !== 'compile') return;
  try {
    const create = (await loadTool(request.tool)).default;
    // Emscripten flushes print per line; forward every line as it arrives.
    let output = '';
    const capture = (stream: 'out' | 'err') => (text: string) => {
      output += `${text}\n`;
      respond({ type: 'log', stream, text });
    };
    const file_is_threaded = threadingAvailable();
    const tool_uses_threads = request.tool !== 'qbsp3';
    const module = await create({
      print: capture('out'),
      printErr: capture('err'),
    });
    // Create the directory structure of every file before writing it.
    const dirs = new Set<string>();
    for (const file of [...request.files]) {
      const parts = file.path.split('/').filter(Boolean);
      for (let i = 1; i < parts.length; i++) {
        dirs.add('/' + parts.slice(0, i).join('/'));
      }
    }
    for (const file of request.outputs) {
      const parts = file.split('/').filter(Boolean);
      for (let i = 1; i < parts.length; i++) {
        dirs.add('/' + parts.slice(0, i).join('/'));
      }
    }
    for (const dir of [...dirs].sort()) {
      try {
        module.FS.mkdir(dir);
      } catch {
        // The directory already exists.
      }
    }
    for (const file of request.files) {
      module.FS.writeFile(file.path, file.data);
    }
    const args = [...request.args];
    if (tool_uses_threads && file_is_threaded) {
      // The pool is preallocated with the module (PTHREAD_POOL_SIZE=8), and
      // exceeding it deadlocks the nested workers, so the thread count is
      // capped there rather than left at the machine default.
      const cap = Math.min(
        typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4,
        8,
      );
      args.unshift('-threads', String(cap));
    }
    module.callMain(args);
    const files: { path: string; data: Uint8Array }[] = [];
    const transfer: Transferable[] = [];
    for (const path of request.outputs) {
      try {
        const data = module.FS.readFile(path);
        const copy = data.slice(0);
        files.push({ path, data: copy });
        transfer.push(copy.buffer as ArrayBuffer);
      } catch {
        // A missing output (for example a non-leaking map writes no .pts) is
        // not an error; the client decides which outputs it requires.
      }
    }
    respond({ type: 'done', output, files }, transfer);
  } catch (error) {
    respond({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
export {};
