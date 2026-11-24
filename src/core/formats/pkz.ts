import type { ByteSource, Inflate } from '@core/types/index';

export interface PkzEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  /** 0 = stored, 8 = deflate. */
  method: number;
  localHeaderOffset: number;
}

export type PkzError =
  'no-end-record' | 'zip64' | 'encrypted' | 'unsupported-method' | 'bad-local-header' | 'truncated';

export class PkzFormatError extends Error {
  constructor(public readonly reason: PkzError) {
    super(reason);
    this.name = 'PkzFormatError';
  }
}

const EOCD_SIG = 0x06054b50;
const CDIR_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

function ascii(view: DataView, offset: number, length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) {
    s += String.fromCharCode(view.getUint8(offset + i));
  }
  return s;
}

/**
 * The central directory of a .pkz (ZIP) archive. ZIP64 and encrypted
 * archives are rejected; only the stored and deflate methods are read.
 */
export async function readPkzDirectory(source: ByteSource): Promise<PkzEntry[]> {
  // the end-of-central-directory record is within the last 64 KiB + 22 bytes
  const windowSize = Math.min(source.size, 22 + 0xffff);
  if (windowSize < 22) {
    throw new PkzFormatError('no-end-record');
  }
  const tail = await source.read(source.size - windowSize, windowSize);
  const view = new DataView(tail.buffer as ArrayBuffer, tail.byteOffset, tail.byteLength);
  let eocd = -1;
  for (let i = windowSize - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new PkzFormatError('no-end-record');
  }
  const count = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new PkzFormatError('zip64');
  }
  if (cdOffset + cdSize > source.size) {
    throw new PkzFormatError('truncated');
  }
  const cd = await source.read(cdOffset, cdSize);
  const cdView = new DataView(cd.buffer as ArrayBuffer, cd.byteOffset, cd.byteLength);
  const entries: PkzEntry[] = [];
  let pos = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > cdSize || cdView.getUint32(pos, true) !== CDIR_SIG) {
      throw new PkzFormatError('truncated');
    }
    const flags = cdView.getUint16(pos + 8, true);
    if (flags & 1) {
      throw new PkzFormatError('encrypted');
    }
    const method = cdView.getUint16(pos + 10, true);
    if (method !== 0 && method !== 8) {
      throw new PkzFormatError('unsupported-method');
    }
    const compressedSize = cdView.getUint32(pos + 20, true);
    const uncompressedSize = cdView.getUint32(pos + 24, true);
    const nameLen = cdView.getUint16(pos + 28, true);
    const extraLen = cdView.getUint16(pos + 30, true);
    const commentLen = cdView.getUint16(pos + 32, true);
    const localHeaderOffset = cdView.getUint32(pos + 42, true);
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      throw new PkzFormatError('zip64');
    }
    entries.push({
      name: ascii(cdView, pos + 46, nameLen),
      compressedSize,
      uncompressedSize,
      method,
      localHeaderOffset,
    });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Reads and inflates one file of the archive. */
export async function readPkzFile(
  source: ByteSource,
  entry: PkzEntry,
  inflate: Inflate,
): Promise<Uint8Array> {
  const fixed = await source.read(entry.localHeaderOffset, 30);
  const view = new DataView(fixed.buffer as ArrayBuffer, fixed.byteOffset, fixed.byteLength);
  if (view.getUint32(0, true) !== LOCAL_SIG) {
    throw new PkzFormatError('bad-local-header');
  }
  const nameLen = view.getUint16(26, true);
  const extraLen = view.getUint16(28, true);
  const dataOffset = entry.localHeaderOffset + 30 + nameLen + extraLen;
  const data = await source.read(dataOffset, entry.compressedSize);
  if (entry.method === 0) {
    return data;
  }
  return inflate(data);
}
