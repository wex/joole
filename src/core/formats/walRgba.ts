import { readWalHeader, readWalMip0 } from './wal';
import type { ConvertedTexture } from '../types/index';

/**
 * Converts a .wal file to RGBA8 pixels with the 256-colour palette: mip 0
 * palette indices become red, green and blue triples with a fully opaque
 * alpha. Index 255 is not transparent in Quake 2, so no transparency is
 * processed (spec, File formats).
 *
 * The palette is expanded to a lookup table of little-endian 32-bit words
 * (red in the lowest byte, alpha in the highest) once per call, and pixels
 * are written a word at a time. The conversion is pure core code; the worker
 * in workers/ is a thin message wrapper around it.
 */
export function convertWalToRgba(wal: Uint8Array, palette: Uint8Array): ConvertedTexture {
  if (palette.byteLength < 768) {
    throw new RangeError('palette must hold at least 768 bytes of RGB triples');
  }
  const header = readWalHeader(wal);
  const pixels = readWalMip0(wal, header);
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    const r = palette[i * 3]!;
    const g = palette[i * 3 + 1]!;
    const b = palette[i * 3 + 2]!;
    table[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  const rgba = new Uint8Array(header.width * header.height * 4);
  const words = new Uint32Array(rgba.buffer);
  for (let i = 0; i < pixels.length; i++) {
    words[i] = table[pixels[i]!]!;
  }
  return { width: header.width, height: header.height, rgba };
}
