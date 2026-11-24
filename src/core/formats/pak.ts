import type { ByteSource } from '@core/types/index';

export interface PakEntry {
  name: string;
  offset: number;
  length: number;
}

export type PakError = 'bad-ident' | 'bad-directory';

export class PakFormatError extends Error {
  constructor(public readonly reason: PakError) {
    super(reason);
    this.name = 'PakFormatError';
  }
}

/**
 * The directory of a .pak archive. The header is 12 little-endian bytes:
 * the "PACK" ident, the directory offset and its length, and each entry is
 * 64 bytes: a zero-padded 56-byte name, the data offset and the length
 * (dpackheader_t and dpackfile_t in common/qfiles.h).
 */
export async function readPakDirectory(source: ByteSource): Promise<PakEntry[]> {
  if (source.size < 12) {
    throw new PakFormatError('bad-ident');
  }
  const header = new DataView((await source.read(0, 12)).buffer as ArrayBuffer);
  const ident = String.fromCharCode(
    header.getUint8(0),
    header.getUint8(1),
    header.getUint8(2),
    header.getUint8(3),
  );
  if (ident !== 'PACK') {
    throw new PakFormatError('bad-ident');
  }
  const dirOfs = header.getInt32(4, true);
  const dirLen = header.getInt32(8, true);
  if (dirOfs < 0 || dirLen < 0 || dirLen % 64 !== 0 || dirOfs + dirLen > source.size) {
    throw new PakFormatError('bad-directory');
  }
  const dirBytes = await source.read(dirOfs, dirLen);
  const view = new DataView(
    dirBytes.buffer as ArrayBuffer,
    dirBytes.byteOffset,
    dirBytes.byteLength,
  );
  const entries: PakEntry[] = [];
  for (let i = 0; i < dirLen / 64; i++) {
    const base = i * 64;
    let nameEnd = 0;
    while (nameEnd < 56 && view.getUint8(base + nameEnd) !== 0) {
      nameEnd++;
    }
    let name = '';
    for (let j = 0; j < nameEnd; j++) {
      name += String.fromCharCode(view.getUint8(base + j));
    }
    entries.push({
      name,
      offset: view.getInt32(base + 56, true),
      length: view.getInt32(base + 60, true),
    });
  }
  return entries;
}

/** Reads one file out of a .pak archive. */
export async function readPakFile(source: ByteSource, entry: PakEntry): Promise<Uint8Array> {
  return source.read(entry.offset, entry.length);
}
