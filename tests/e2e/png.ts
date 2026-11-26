import { inflateSync } from 'node:zlib';

export interface PngImage {
  readonly width: number;
  readonly height: number;
  /** RGBA bytes, row-major, four per pixel. */
  readonly data: Uint8Array;
}

/**
 * Decodes the non-interlaced 8-bit RGB/RGBA PNGs Playwright screenshots
 * produce. Only what the tests need: no interlacing, no palette, no 16-bit.
 */
export function decodePng(buffer: Buffer): PngImage {
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') {
    throw new Error('not a PNG');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8]!;
      colorType = body[9]!;
      interlace = body[12]!;
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (depth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported PNG: depth ${depth}, type ${colorType}, interlace ${interlace}`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const out = new Uint8Array(width * height * 4);
  const row = new Uint8Array(stride);
  const prev = new Uint8Array(stride);
  let at = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[at++]!;
    for (let x = 0; x < stride; x++) {
      const v = raw[at++]!;
      const left = x >= channels ? row[x - channels]! : 0;
      const up = prev[x]!;
      const upLeft = x >= channels ? prev[x - channels]! : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = v;
          break;
        case 1:
          value = v + left;
          break;
        case 2:
          value = v + up;
          break;
        case 3:
          value = v + Math.floor((left + up) / 2);
          break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          value = v + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default:
          throw new Error(`unknown filter ${filter}`);
      }
      row[x] = value & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const target = (y * width + x) * 4;
      out[target] = row[x * channels]!;
      out[target + 1] = row[x * channels + 1]!;
      out[target + 2] = row[x * channels + 2]!;
      out[target + 3] = channels === 4 ? row[x * channels + 3]! : 255;
    }
    prev.set(row);
  }
  return { width, height, data: out };
}

/** Counts pixels matching a loose colour in a rectangle of the image. */
export function countColor(
  image: PngImage,
  rect: { x: number; y: number; width: number; height: number },
  match: (r: number, g: number, b: number) => boolean,
): number {
  let count = 0;
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(image.width, Math.ceil(rect.x + rect.width));
  const y1 = Math.min(image.height, Math.ceil(rect.y + rect.height));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const at = (y * image.width + x) * 4;
      if (match(image.data[at]!, image.data[at + 1]!, image.data[at + 2]!)) {
        count++;
      }
    }
  }
  return count;
}
