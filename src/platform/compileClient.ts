import type { CompileTool, CompileWorkerRequest, CompileWorkerResponse } from '@core/types/index';

export interface CompileRunResult {
  readonly files: readonly { path: string; data: Uint8Array }[];
  readonly output: string;
  readonly cancelled: boolean;
}

export interface CompileRunOptions {
  readonly tool: CompileTool;
  readonly args: readonly string[];
  readonly files: readonly { path: string; data: Uint8Array }[];
  readonly outputs: readonly string[];
  /** Called with each stdout or stderr line as the tool produces it. */
  readonly onLog?: (stream: 'out' | 'err', text: string) => void;
}

/**
 * Runs one compiler tool in a fresh Web Worker. The worker streams stdout
 * back line by line; cancelling terminates the worker, which is the only
 * way to stop a running wasm compile.
 */
export class CompileClient {
  private worker: Worker | null = null;
  private rejectActive: ((error: Error) => void) | null = null;

  run(options: CompileRunOptions): Promise<CompileRunResult> {
    this.cancel();
    const worker = new Worker(new URL('../../workers/compile.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker = worker;
    return new Promise<CompileRunResult>((resolve, reject) => {
      this.rejectActive = reject;
      worker.onmessage = (event: MessageEvent<CompileWorkerResponse>) => {
        const message = event.data;
        if (message.type === 'log') {
          options.onLog?.(message.stream, message.text);
          return;
        }
        worker.terminate();
        if (this.worker === worker) {
          this.worker = null;
          this.rejectActive = null;
        }
        if (message.type === 'done') {
          resolve({ files: message.files, output: message.output, cancelled: false });
        } else {
          reject(new Error(message.message));
        }
      };
      worker.onerror = (event) => {
        worker.terminate();
        if (this.worker === worker) {
          this.worker = null;
          this.rejectActive = null;
        }
        reject(new Error(event.message || 'compile worker failed'));
      };
      const files = options.files.map((file) => ({
        path: file.path,
        data: file.data.slice(0),
      }));
      const request: CompileWorkerRequest = {
        type: 'compile',
        tool: options.tool,
        args: options.args,
        files,
        outputs: options.outputs,
      };
      worker.postMessage(
        request,
        files.map((file) => file.data.buffer as ArrayBuffer),
      );
    });
  }

  /** Terminates the running compile, rejecting its promise. */
  cancel(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.rejectActive) {
      this.rejectActive(new Error('compile cancelled'));
      this.rejectActive = null;
    }
  }
}
