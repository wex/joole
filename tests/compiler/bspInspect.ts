/** Test-only Quake 2 BSP lump readers. This is not a product BSP importer. */

export interface BspLump {
  readonly offset: number;
  readonly length: number;
  readonly bytes: Uint8Array;
}

export function bspLump(bsp: Uint8Array, lump: number): BspLump {
  const view = new DataView(bsp.buffer, bsp.byteOffset, bsp.byteLength);
  const at = 8 + lump * 8;
  const offset = view.getInt32(at, true);
  const length = view.getInt32(at + 4, true);
  return { offset, length, bytes: bsp.subarray(offset, offset + length) };
}

export interface TexinfoEntry {
  readonly flags: number;
  readonly value: number;
  readonly texture: string;
}

/** Texinfo lump 5: 76 bytes per entry, flags/value/name after the UV vectors. */
export function texinfoOf(bsp: Uint8Array): TexinfoEntry[] {
  const lump = bspLump(bsp, 5);
  const view = new DataView(lump.bytes.buffer, lump.bytes.byteOffset, lump.bytes.byteLength);
  const out: TexinfoEntry[] = [];
  for (let at = 0; at + 76 <= lump.length; at += 76) {
    let texture = '';
    for (let i = 0; i < 32; i++) {
      const c = view.getUint8(at + 40 + i);
      if (c === 0) break;
      texture += String.fromCharCode(c);
    }
    out.push({
      flags: view.getInt32(at + 32, true),
      value: view.getInt32(at + 36, true),
      texture,
    });
  }
  return out;
}

export interface LightingStats {
  readonly length: number;
  readonly nonzero: number;
  readonly sum: number;
  readonly max: number;
}

/** Lighting lump 7 as simple byte statistics, sufficient for controlled fixtures. */
export function lightingStats(bsp: Uint8Array): LightingStats {
  const bytes = bspLump(bsp, 7).bytes;
  let nonzero = 0;
  let sum = 0;
  let max = 0;
  for (const byte of bytes) {
    if (byte !== 0) nonzero++;
    sum += byte;
    if (byte > max) max = byte;
  }
  return { length: bytes.byteLength, nonzero, sum, max };
}

/** Entity lump 0 as text, for structural spot/default-light assertions. */
export function entityTextOf(bsp: Uint8Array): string {
  return new TextDecoder().decode(bspLump(bsp, 0).bytes);
}
