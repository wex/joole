import type { Inflate } from '@core/types/index';

/**
 * Deflate decompression through the browser's DecompressionStream with the
 * deflate-raw variant a ZIP archive uses. This is the platform-layer
 * implementation the core parsers receive as a parameter.
 */
export const browserInflate: Inflate = async (data) => {
  const stream = new Blob([data.buffer as ArrayBuffer])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};
