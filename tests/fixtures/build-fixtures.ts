/**
 * Builds the tiny synthetic pak, pkz, wal and pcx fixtures committed in
 * this directory. Run with: pnpm exec vite-node tests/fixtures/build-fixtures.ts
 */
import { deflateRawSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

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
console.log('fixtures built');
