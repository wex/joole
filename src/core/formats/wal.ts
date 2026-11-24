export interface WalHeader {
  name: string;
  width: number;
  height: number;
  /** File offsets of the four mip levels, mip 0 first. */
  offsets: [number, number, number, number];
  animname: string;
  flags: number;
  contents: number;
  value: number;
}

export class WalFormatError extends Error {
  constructor(public readonly reason: 'too-small') {
    super(reason);
    this.name = 'WalFormatError';
  }
}

const WAL_HEADER_SIZE = 100;

/**
 * The .wal header: miptex_t in common/qfiles.h, 100 little-endian bytes.
 * flags, contents and value are the texture's surface attributes.
 */
export function readWalHeader(bytes: Uint8Array): WalHeader {
  if (bytes.byteLength < WAL_HEADER_SIZE) {
    throw new WalFormatError('too-small');
  }
  const view = new DataView(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
  function fixedString(offset: number, max: number): string {
    let end = 0;
    while (end < max && view.getUint8(offset + end) !== 0) {
      end++;
    }
    let s = '';
    for (let j = 0; j < end; j++) {
      s += String.fromCharCode(view.getUint8(offset + j));
    }
    return s;
  }
  return {
    name: fixedString(0, 32),
    width: view.getUint32(32, true),
    height: view.getUint32(36, true),
    offsets: [
      view.getUint32(40, true),
      view.getUint32(44, true),
      view.getUint32(48, true),
      view.getUint32(52, true),
    ],
    animname: fixedString(56, 32),
    flags: view.getInt32(88, true),
    contents: view.getInt32(92, true),
    value: view.getInt32(96, true),
  };
}

/** The mip 0 pixels: width times height palette indices at offsets[0]. */
export function readWalMip0(bytes: Uint8Array, header: WalHeader): Uint8Array {
  const length = header.width * header.height;
  return bytes.subarray(header.offsets[0], header.offsets[0] + length);
}
