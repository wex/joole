import type { ByteSource } from '@core/types/index';
import { inflateRawSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

export function memByteSource(bytes: Uint8Array): ByteSource {
  return {
    size: bytes.byteLength,
    read(offset: number, length: number): Promise<Uint8Array> {
      return Promise.resolve(bytes.slice(offset, offset + length));
    },
  };
}

export function fixtureSource(name: string): ByteSource {
  return memByteSource(new Uint8Array(readFileSync(`tests/fixtures/${name}`)));
}

/** Node's zlib behind the Inflate interface, for tests. */
export function nodeInflate(data: Uint8Array): Promise<Uint8Array> {
  return Promise.resolve(new Uint8Array(inflateRawSync(data)));
}

export function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(`tests/fixtures/${name}`));
}
