import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { convertWalToRgba } from '@core/formats/index';
import type { TextureConvertRequest, TextureWorkerResponse } from '@core/types/index';
import { TextureClient, type WorkerLike } from './textureClient';

const tinyWal = new Uint8Array(readFileSync('tests/fixtures/tiny.wal'));
const colormapPcx = new Uint8Array(
  readFileSync('tests/fixtures/colormap.pcx').buffer as ArrayBuffer,
);
const palette = colormapPcx.subarray(colormapPcx.byteLength - 768);

/**
 * A fake worker that runs the real conversion synchronously on postMessage,
 * so the client is tested against the genuine core logic.
 */
class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<TextureWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly messages: unknown[] = [];

  postMessage(message: unknown): void {
    this.messages.push(message);
    const request = message as TextureConvertRequest;
    const result = convertWalToRgba(new Uint8Array(request.wal), new Uint8Array(request.palette));
    queueMicrotask(() => {
      this.onmessage?.({
        data: {
          type: 'converted',
          id: request.id,
          width: result.width,
          height: result.height,
          rgba: result.rgba.buffer.slice(0) as ArrayBuffer,
        },
      } as MessageEvent<TextureWorkerResponse>);
    });
  }

  terminate(): void {}
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe('TextureClient', () => {
  it('resolves conversions with width, height and RGBA8 pixels', async () => {
    const client = new TextureClient(() => new FakeWorker());
    const result = await client.convert(copyBytes(tinyWal), copyBytes(palette));
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
    expect(result.rgba.byteLength).toBe(64);
    expect(result.rgba[3]).toBe(255);
    client.terminate();
  });

  it('matches concurrent responses to their requests by id', async () => {
    const client = new TextureClient(() => new FakeWorker());
    const results = await Promise.all([
      client.convert(copyBytes(tinyWal), copyBytes(palette)),
      client.convert(copyBytes(tinyWal), copyBytes(palette)),
      client.convert(copyBytes(tinyWal), copyBytes(palette)),
    ]);
    for (const result of results) {
      expect(result.width).toBe(4);
    }
    client.terminate();
  });

  it('rejects pending requests when the worker errors', async () => {
    // A fake that answers with the error shape of the protocol.
    class ErrorWorker implements WorkerLike {
      onmessage: ((event: MessageEvent<TextureWorkerResponse>) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      postMessage(message: unknown): void {
        const request = message as TextureConvertRequest;
        queueMicrotask(() => {
          this.onmessage?.({
            data: { type: 'error', id: request.id, message: 'broken wal' },
          } as MessageEvent<TextureWorkerResponse>);
        });
      }
      terminate(): void {}
    }
    const client = new TextureClient(() => new ErrorWorker());
    await expect(client.convert(copyBytes(tinyWal), copyBytes(palette))).rejects.toThrow(
      'broken wal',
    );
    client.terminate();
  });
});
