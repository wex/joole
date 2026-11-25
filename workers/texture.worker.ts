import { convertWalToRgba } from '../src/core/formats/index';
import type { TextureConvertRequest, TextureWorkerResponse } from '../src/core/types/index';

/**
 * The texture conversion worker: a .wal file plus the palette in, an RGBA8
 * ArrayBuffer out as a transferable. All parsing and conversion is the pure
 * core code of core/formats; this file is only the message plumbing. The
 * worker imports nothing outside core/ and game/ (the layer rules).
 */
function respond(message: TextureWorkerResponse, transfer: Transferable[] = []): void {
  postMessage(message, { transfer });
}

onmessage = (event: MessageEvent<TextureConvertRequest>) => {
  const request = event.data;
  if (request.type !== 'convert') {
    return;
  }
  try {
    const result = convertWalToRgba(new Uint8Array(request.wal), new Uint8Array(request.palette));
    // Copy into a fresh buffer: the pixels are the whole message anyway, and
    // the copy is transferable while a subarray view need not be.
    const rgba = result.rgba.buffer.slice(0) as ArrayBuffer;
    respond(
      { type: 'converted', id: request.id, width: result.width, height: result.height, rgba },
      [rgba],
    );
  } catch (error) {
    respond({
      type: 'error',
      id: request.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
