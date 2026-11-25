import type { ByteSource } from '@core/types/index';

/** A ByteSource over Blob.slice: only the requested range is read. */
export function blobByteSource(blob: Blob): ByteSource {
  return {
    size: blob.size,
    async read(offset: number, length: number): Promise<Uint8Array> {
      return new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer());
    },
  };
}
