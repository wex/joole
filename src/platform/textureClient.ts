import type {
  ConvertedTexture,
  TextureConvertRequest,
  TextureWorkerResponse,
} from '@core/types/index';

/**
 * The minimal slice of the Worker interface the client uses, structural so
 * tests can substitute a fake worker in Node.
 */
export interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<TextureWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

export type WorkerFactory = () => WorkerLike;

/** The production factory: the worker bundle built by Vite. */
export function createTextureWorker(): WorkerLike {
  return new Worker(new URL('../../workers/texture.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerLike;
}

interface Pending {
  resolve: (texture: ConvertedTexture) => void;
  reject: (error: Error) => void;
}

/**
 * The worker client: one texture worker behind a promise interface. The
 * conversion requests carry transferable buffers, so the caller's copy is
 * neutered and the answer comes back without copying. Requests are answered
 * in any order and matched by id.
 */
export class TextureClient {
  private readonly worker: WorkerLike;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(factory: WorkerFactory = createTextureWorker) {
    this.worker = factory();
    this.worker.onmessage = (event) => this.handleMessage(event.data);
    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'texture worker failed');
      for (const pending of this.pending.values()) {
        pending.reject(error);
      }
      this.pending.clear();
    };
  }

  /** Converts a .wal file to RGBA8. Both buffers are transferred away. */
  convert(wal: ArrayBuffer, palette: ArrayBuffer): Promise<ConvertedTexture> {
    const id = this.nextId++;
    const request: TextureConvertRequest = { type: 'convert', id, wal, palette };
    return new Promise<ConvertedTexture>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage(request, [wal, palette]);
    });
  }

  terminate(): void {
    this.worker.terminate();
    const error = new Error('texture worker terminated');
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }

  private handleMessage(message: TextureWorkerResponse): void {
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    this.pending.delete(message.id);
    if (message.type === 'converted') {
      pending.resolve({
        width: message.width,
        height: message.height,
        rgba: new Uint8Array(message.rgba),
      });
    } else {
      pending.reject(new Error(message.message));
    }
  }
}
