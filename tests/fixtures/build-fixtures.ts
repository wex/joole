/**
 * Builds the tiny synthetic pak, pkz, wal and pcx fixtures committed in
 * this directory. Run with: node tests/fixtures/build-fixtures.ts
 */
import { deflateRawSync } from 'node:zlib';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';

function ascii(s: string): number[] {
  return [...s].map((c) => c.charCodeAt(0));
}

function buildPak(): Uint8Array {
  const content = new TextEncoder().encode('hello pak\n');
  const name = 'test/hello.txt';
  const headerSize = 12;
  const dirLen = 64;
  const dataOffset = headerSize;
  const dirOffset = dataOffset + content.length;
  const out = new Uint8Array(dirOffset + dirLen);
  const view = new DataView(out.buffer);
  out.set(ascii('PACK'), 0);
  view.setInt32(4, dirOffset, true);
  view.setInt32(8, dirLen, true);
  out.set(content, dataOffset);
  const padded = new Uint8Array(56);
  padded.set(ascii(name));
  out.set(padded, dirOffset);
  view.setInt32(dirOffset + 56, dataOffset, true);
  view.setInt32(dirOffset + 60, content.length, true);
  return out;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let k = 0; k < 8; k++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipEntry(name: string, data: Uint8Array, method: 0 | 8) {
  const payload = method === 8 ? new Uint8Array(deflateRawSync(data)) : data;
  const nameBytes = new TextEncoder().encode(name);
  const crc = crc32(data);
  return { name, nameBytes, data, payload, method, crc };
}

function buildPkz(): Uint8Array {
  const entries = [
    zipEntry('stored.txt', new TextEncoder().encode('stored contents\n'), 0),
    zipEntry('deflated.txt', new TextEncoder().encode('deflated contents, deflated contents\n'), 8),
  ];
  const parts: number[] = [];
  const central: number[] = [];
  let offset = 0;
  const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
  const u32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
  for (const e of entries) {
    const local = [
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0),
      ...u16(e.method),
      ...u16(0),
      ...u16(0),
      ...u32(e.crc),
      ...u32(e.payload.length),
      ...u32(e.data.length),
      ...u16(e.nameBytes.length),
      ...u16(0),
      ...e.nameBytes,
    ];
    central.push(
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0),
      ...u16(e.method),
      ...u16(0),
      ...u16(0),
      ...u32(e.crc),
      ...u32(e.payload.length),
      ...u32(e.data.length),
      ...u16(e.nameBytes.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset),
      ...e.nameBytes,
    );
    parts.push(...local, ...e.payload);
    offset += local.length + e.payload.length;
  }
  const cdOffset = parts.length;
  parts.push(...central);
  parts.push(
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(entries.length),
    ...u16(entries.length),
    ...u32(central.length),
    ...u32(cdOffset),
    ...u16(0),
  );
  return new Uint8Array(parts);
}

function buildWal(): Uint8Array {
  const out = new Uint8Array(100 + 16 + 4 + 1 + 1);
  const view = new DataView(out.buffer);
  const name = new Uint8Array(32);
  name.set(ascii('e2u1/mine10_1'));
  out.set(name, 0);
  view.setUint32(32, 4, true); // width
  view.setUint32(36, 4, true); // height
  view.setUint32(40, 100, true); // mip 0 offset
  view.setUint32(44, 116, true);
  view.setUint32(48, 120, true);
  view.setUint32(52, 121, true);
  view.setInt32(88, 0x21, true); // flags
  view.setInt32(92, 1, true); // contents
  view.setInt32(96, 7, true); // value
  for (let i = 0; i < 16; i++) {
    out[100 + i] = i;
  }
  return out;
}

/**
 * A 64 × 64 texture for the renderer's screenshot tests: 16-texel checker
 * cells of palette indices 40 and 200, grid lines of index 255, and the
 * top-left cell filled with index 128 so the texture's origin and
 * orientation are visible. All four mip levels are present.
 */
function buildHarnessWal(): Uint8Array {
  const size = 64;
  const mipBytes = [size * size, (size / 2) ** 2, (size / 4) ** 2, (size / 8) ** 2];
  const out = new Uint8Array(100 + mipBytes.reduce((a, b) => a + b, 0));
  const view = new DataView(out.buffer);
  out.set(ascii('e2u1/mine10_1'), 0);
  view.setUint32(32, size, true);
  view.setUint32(36, size, true);
  let offset = 100;
  mipBytes.forEach((bytes, level) => {
    view.setUint32(40 + level * 4, offset, true);
    const s = size >> level;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const tx = x << level;
        const ty = y << level;
        let index = ((tx >> 4) ^ (ty >> 4)) & 1 ? 200 : 40;
        if (tx < 16 && ty < 16) {
          index = 128;
        }
        if (tx % 16 === 0 || ty % 16 === 0) {
          index = 255;
        }
        out[offset + y * s + x] = index;
      }
    }
    offset += bytes;
  });
  return out;
}

type Point = [number, number, number];

interface Tex {
  name: string;
  offset?: [number, number];
  rotation?: number;
  scale?: [number, number];
  /** contents, flags and value; written only when given. */
  attribs?: [number, number, number];
}

/**
 * One .map face line. The three points are ordered so that qbsp3's
 * PlaneFromPoints, normal = (p0 - p1) x (p2 - p1), points along the outward
 * normal n.
 */
function faceLine([p0, p1, p2]: [Point, Point, Point], n: Point, tex: Tex): string {
  const t1 = [p0[0] - p1[0], p0[1] - p1[1], p0[2] - p1[2]];
  const t2 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
  const c = [
    t1[1]! * t2[2]! - t1[2]! * t2[1]!,
    t1[2]! * t2[0]! - t1[0]! * t2[2]!,
    t1[0]! * t2[1]! - t1[1]! * t2[0]!,
  ];
  const points = c[0]! * n[0] + c[1]! * n[1] + c[2]! * n[2] > 0 ? [p0, p1, p2] : [p0, p2, p1];
  const [xoff, yoff] = tex.offset ?? [0, 0];
  const [xscale, yscale] = tex.scale ?? [1, 1];
  const attribs = tex.attribs ? ` ${tex.attribs.join(' ')}` : '';
  return `${points.map((p) => `( ${p.join(' ')} )`).join(' ')} ${tex.name} ${xoff} ${yoff} ${tex.rotation ?? 0} ${xscale} ${yscale}${attribs}`;
}

function boxBrush(min: Point, max: Point, tex: Tex): string[] {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  return [
    '{',
    faceLine(
      [
        [x1, y0, z0],
        [x1, y1, z0],
        [x1, y0, z1],
      ],
      [1, 0, 0],
      tex,
    ),
    faceLine(
      [
        [x0, y0, z0],
        [x0, y1, z0],
        [x0, y0, z1],
      ],
      [-1, 0, 0],
      tex,
    ),
    faceLine(
      [
        [x0, y1, z0],
        [x1, y1, z0],
        [x0, y1, z1],
      ],
      [0, 1, 0],
      tex,
    ),
    faceLine(
      [
        [x0, y0, z0],
        [x1, y0, z0],
        [x0, y0, z1],
      ],
      [0, -1, 0],
      tex,
    ),
    faceLine(
      [
        [x0, y0, z1],
        [x1, y0, z1],
        [x0, y1, z1],
      ],
      [0, 0, 1],
      tex,
    ),
    faceLine(
      [
        [x0, y0, z0],
        [x1, y0, z0],
        [x0, y1, z0],
      ],
      [0, 0, -1],
      tex,
    ),
    '}',
  ];
}

/**
 * The renderer's fixture map: a closed room whose brushes cover every draw
 * path of the views. The floor, the rotated south wall and the ramp use
 * e2u1/mine10_1, which the E2E harness loads through the texture worker;
 * e2u1/mine10_2 stays the checker. The ceiling is sky, two panes are
 * TRANS33 and TRANS66, one brush is clip, the ramp is a grouped wedge with
 * a sloped face, the door is a brush entity, and the player start and the
 * light are point entities.
 */
function buildRoomMap(): string {
  const wall: Tex = { name: 'e2u1/mine10_2' };
  const floor: Tex = { name: 'e2u1/mine10_1' };
  const lines = [
    '{',
    '"classname" "worldspawn"',
    '"message" "Joole renderer fixture"',
    ...boxBrush([-272, -272, -16], [272, 272, 0], floor),
    ...boxBrush([-272, -272, 192], [272, 272, 208], { name: 'e1u1/sky1', attribs: [0, 4, 0] }),
    ...boxBrush([-272, 256, 0], [272, 272, 192], wall),
    ...boxBrush([-272, -272, 0], [272, -256, 192], {
      name: 'e2u1/mine10_1',
      rotation: 45,
      scale: [2, 2],
      offset: [16, 0],
    }),
    ...boxBrush([256, -256, 0], [272, 256, 192], wall),
    ...boxBrush([-272, -256, 0], [-256, 256, 192], wall),
    ...boxBrush([-128, -4, 0], [0, 4, 128], { name: 'e2u1/glass', attribs: [0, 16, 0] }),
    ...boxBrush([32, -4, 0], [96, 4, 64], { name: 'e2u1/glass', attribs: [0, 32, 0] }),
    ...boxBrush([128, 128, 0], [192, 192, 64], { name: 'e1u1/clip', attribs: [0x30000, 0, 0] }),
    '}',
    '{',
    '"classname" "func_group"',
    '"_joole_id" "g_ramp"',
    '"_joole_name" "Ramp"',
    '{',
    faceLine(
      [
        [128, -192, 0],
        [256, -192, 0],
        [128, -64, 0],
      ],
      [0, 0, -1],
      floor,
    ),
    faceLine(
      [
        [256, -192, 0],
        [256, -64, 0],
        [256, -192, 64],
      ],
      [1, 0, 0],
      floor,
    ),
    faceLine(
      [
        [128, -192, 0],
        [256, -192, 0],
        [256, -192, 64],
      ],
      [0, -1, 0],
      floor,
    ),
    faceLine(
      [
        [128, -64, 0],
        [256, -64, 0],
        [256, -64, 64],
      ],
      [0, 1, 0],
      floor,
    ),
    faceLine(
      [
        [128, -192, 0],
        [256, -192, 64],
        [128, -64, 0],
      ],
      [-1, 0, 2],
      floor,
    ),
    '}',
    '}',
    '{',
    '"classname" "func_door"',
    '"angle" "90"',
    '"speed" "100"',
    ...boxBrush([-48, 200, 0], [48, 216, 112], wall),
    '}',
    '{',
    '"classname" "info_player_start"',
    '"origin" "0 -128 24"',
    '"angle" "90"',
    '}',
    '{',
    '"classname" "light"',
    '"origin" "0 0 160"',
    '"light" "300"',
    '}',
  ];
  return `${lines.join('\n')}\n`;
}

function buildPcx(): Uint8Array {
  const out = new Uint8Array(128 + 1 + 768);
  out[0] = 10; // manufacturer
  out[2] = 1; // encoding
  out[128] = 0x0c;
  for (let i = 0; i < 256; i++) {
    out[129 + i * 3] = i;
    out[129 + i * 3 + 1] = 255 - i;
    out[129 + i * 3 + 2] = 0;
  }
  return out;
}

function buildTexturePak(entries: [string, string][]): Uint8Array {
  const encoder = new TextEncoder();
  const parts: number[] = [];
  const dir: number[] = [];
  const u32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
  parts.push(...ascii('PACK'));
  const dirOfsPos = parts.length;
  parts.push(...u32(0), ...u32(0));
  const offsets: [string, number, number][] = [];
  for (const [name, content] of entries) {
    const bytes = encoder.encode(content);
    offsets.push([name, parts.length, bytes.length]);
    parts.push(...bytes);
  }
  const dirOffset = parts.length;
  for (const [name, offset, length] of offsets) {
    const padded = new Uint8Array(56);
    padded.set(ascii(name).slice(0, 56));
    dir.push(...padded, ...u32(offset), ...u32(length));
  }
  parts.push(...dir);
  const out = new Uint8Array(parts);
  const view = new DataView(out.buffer);
  view.setInt32(dirOfsPos, dirOffset, true);
  view.setInt32(dirOfsPos + 4, dir.length, true);
  return out;
}

writeFileSync('tests/fixtures/tiny.pak', buildPak());
writeFileSync(
  'tests/fixtures/textures.pak',
  buildTexturePak([
    ['textures/e2u1/mine10_1.wal', 'base texture'],
    ['textures/e2u1/mine10_2.wal', 'another base texture'],
  ]),
);
writeFileSync(
  'tests/fixtures/modtex.pkz',
  (() => {
    // a pkz with one stored texture entry, built on the tiny zip writer
    const entry = zipEntry(
      'textures/e2u1/mine10_1.wal',
      new TextEncoder().encode('mod texture'),
      0,
    );
    const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
    const u32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
    const parts: number[] = [];
    const local = [
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(entry.crc),
      ...u32(entry.payload.length),
      ...u32(entry.data.length),
      ...u16(entry.nameBytes.length),
      ...u16(0),
      ...entry.nameBytes,
    ];
    parts.push(...local, ...entry.payload);
    const cdOffset = parts.length;
    const central = [
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(entry.crc),
      ...u32(entry.payload.length),
      ...u32(entry.data.length),
      ...u16(entry.nameBytes.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(0),
      ...entry.nameBytes,
    ];
    parts.push(...central);
    parts.push(
      ...u32(0x06054b50),
      ...u16(0),
      ...u16(0),
      ...u16(1),
      ...u16(1),
      ...u32(central.length),
      ...u32(cdOffset),
      ...u16(0),
    );
    return new Uint8Array(parts);
  })(),
);
writeFileSync('tests/fixtures/tiny.pkz', buildPkz());
writeFileSync('tests/fixtures/tiny.wal', buildWal());
writeFileSync('tests/fixtures/colormap.pcx', buildPcx());
writeFileSync('tests/fixtures/harness.wal', buildHarnessWal());
/**
 * The UV parity fixture: every face exercises a different texture
 * parameterisation so that the qbsp3 texinfo comparison covers rotation
 * quadrants, non-uniform scale, negative offsets and the decimal truncation
 * rule (8.9 truncates to 8, -4.2 to -4, 45.7 to 45). The prism adds a sloped
 * plane, so the base-orientation choice is exercised off the axis planes.
 */
function buildUvParityMap(): string {
  const tex = 'e2u1/mine10_1';
  const lines: string[] = ['{', '"classname" "worldspawn"'];
  // Axis-aligned box, decimal offsets and rotation (truncation exercise).
  lines.push(
    ...boxBrush([0, 0, 0], [64, 64, 64], {
      name: tex,
      offset: [8.9, -4.2],
      rotation: 45.7,
    }),
  );
  // Exact 90 degree rotation with non-uniform scale.
  lines.push(
    ...boxBrush([128, 0, 0], [192, 64, 64], {
      name: tex,
      rotation: 90,
      scale: [0.5, 2],
    }),
  );
  // Rotation 270 with negative offsets.
  lines.push(
    ...boxBrush([256, 0, 0], [320, 64, 64], {
      name: tex,
      offset: [-16.7, 33.3],
      rotation: 270,
      scale: [1.5, 1],
    }),
  );
  // Rotation 180 with fractional scale.
  lines.push(
    ...boxBrush([384, 0, 0], [448, 64, 64], {
      name: tex,
      rotation: 180,
      scale: [0.75, 1.25],
    }),
  );
  // A triangular prism with a 45 degree slope (the x+z=64 plane), shifted
  // away from the other brushes; rotation 45 truncates exactly.
  const ox = 0;
  const oy = 192;
  const at = (p: Point): Point => [p[0] + ox, p[1] + oy, p[2]];
  const prismTex: Tex = { name: tex, rotation: 45, offset: [3.9, 3.9] };
  lines.push('{');
  // bottom z=0, outward normal -z
  lines.push(faceLine([at([0, 0, 0]), at([64, 0, 0]), at([0, 64, 0])], [0, 0, -1], prismTex));
  // wall x=0, outward normal -x
  lines.push(faceLine([at([0, 0, 0]), at([0, 64, 0]), at([0, 0, 64])], [-1, 0, 0], prismTex));
  // slope x+z=64, outward normal +x+z
  lines.push(faceLine([at([64, 0, 0]), at([0, 0, 64]), at([64, 64, 0])], [1, 0, 1], prismTex));
  // wall y=0, outward normal -y
  lines.push(faceLine([at([0, 0, 0]), at([64, 0, 0]), at([0, 0, 64])], [0, -1, 0], prismTex));
  // wall y=64, outward normal +y
  lines.push(faceLine([at([0, 64, 0]), at([64, 64, 0]), at([0, 64, 64])], [0, 1, 0], prismTex));
  lines.push('}');
  lines.push('}');
  return lines.join('\n') + '\n';
}

writeFileSync('tests/fixtures/uvparity.map', buildUvParityMap());
writeFileSync('tests/fixtures/room.map', buildRoomMap());
mkdirSync('tests/fixtures/game/baseq2/pics', { recursive: true });
mkdirSync('tests/fixtures/game/baseq2/textures/e2u1', { recursive: true });
copyFileSync('tests/fixtures/colormap.pcx', 'tests/fixtures/game/baseq2/pics/colormap.pcx');
copyFileSync('tests/fixtures/harness.wal', 'tests/fixtures/game/baseq2/textures/e2u1/mine10_1.wal');
// Extra textures for the texture browser E2E in a separate game directory, so
// the other UI tests keep their single-texture renderer statistics.
mkdirSync('tests/fixtures/game-browser/baseq2/pics', { recursive: true });
mkdirSync('tests/fixtures/game-browser/baseq2/textures/e1u1', { recursive: true });
mkdirSync('tests/fixtures/game-browser/baseq2/textures/e2u1', { recursive: true });
copyFileSync('tests/fixtures/colormap.pcx', 'tests/fixtures/game-browser/baseq2/pics/colormap.pcx');
for (const name of [
  'e2u1/mine10_1',
  'e2u1/mine10_2',
  'e2u1/mine10_3',
  'e1u1/basic1_1',
  'e1u1/basic1_2',
  'e1u1/metal1_1',
]) {
  copyFileSync(
    'tests/fixtures/harness.wal',
    `tests/fixtures/game-browser/baseq2/textures/${name}.wal`,
  );
}
console.log('fixtures built');
