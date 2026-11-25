export type * from './document';
export type * from './patch';
export type * from './io';
export type * from './result';
export type * from './texture';

/** A compile request to the compiler worker: tool, arguments and in-memory files. */
export interface CompileWorkerRequest {
  readonly type: 'compile';
  readonly tool: 'qbsp3' | 'qvis3' | 'qrad3';
  readonly args: readonly string[];
  /** Absolute emscripten paths and their contents, written before the run. */
  readonly files: readonly { path: string; data: Uint8Array }[];
  /** Paths read back after the run and transferred to the client. */
  readonly outputs: readonly string[];
}

export type CompileWorkerResponse =
  | { type: 'log'; stream: 'out' | 'err'; text: string }
  | { type: 'done'; output: string; files: { path: string; data: Uint8Array }[] }
  | { type: 'error'; message: string };

export type CompileTool = 'qbsp3' | 'qvis3' | 'qrad3';
