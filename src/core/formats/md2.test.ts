import { describe, expect, it } from 'vitest';
import { parseMd2 } from './md2';

/** Builds a minimal valid md2: one triangle in one frame. */
function syntheticMd2(): ArrayBuffer {
  const numXyz = 3;
  const numTris = 1;
  const numFrames = 1;
  const frameSize = 40 + numXyz * 4; // scale+translate+name+vertices
  const ofsTris = 68;
  const ofsFrames = ofsTris + numTris * 12;
  const ofsEnd = ofsFrames + frameSize;
  const buffer = new ArrayBuffer(ofsEnd);
  const view = new DataView(buffer);
  const write = (at: number, v: number) => view.setInt32(at, v, true);
  write(0, 0x32504449); // IDP2
  write(4, 8); // version
  write(8, 64); // skinwidth
  write(12, 64); // skinheight
  write(16, frameSize);
  write(20, 0); // num_skins
  write(24, numXyz);
  write(28, 0); // num_st
  write(32, 0);
  write(36, numTris);
  write(40, 0); // num_glcmds
  write(44, numFrames);
  write(48, 0); // ofs_skins
  write(52, 0); // ofs_st
  write(56, ofsTris);
  write(60, ofsFrames);
  write(64, 0); // ofs_glcmds
  // triangle: vertices 0,1,2
  view.setUint16(ofsTris, 0, true);
  view.setUint16(ofsTris + 2, 1, true);
  view.setUint16(ofsTris + 4, 2, true);
  // frame: scale 1,1,1; translate 8,0,0; name; vertices
  view.setFloat32(ofsFrames, 1, true);
  view.setFloat32(ofsFrames + 4, 1, true);
  view.setFloat32(ofsFrames + 8, 1, true);
  view.setFloat32(ofsFrames + 12, 8, true);
  view.setFloat32(ofsFrames + 16, 0, true);
  view.setFloat32(ofsFrames + 20, 0, true);
  const bytes = new Uint8Array(buffer);
  // vertex 0 = (16, 0, 0) → compressed (8,0,0) since translate is 8
  bytes.set([8, 0, 0, 0], ofsFrames + 40);
  // vertex 1 = (8, 16, 0) → compressed (0,16,0)
  bytes.set([0, 16, 0, 0], ofsFrames + 44);
  // vertex 2 = (8, 0, 16) → compressed (0,0,16)
  bytes.set([0, 0, 16, 0], ofsFrames + 48);
  return buffer;
}

describe('parseMd2', () => {
  it('parses frame 0 into unique wireframe edges', () => {
    const wire = parseMd2(syntheticMd2());
    expect(wire.numTris).toBe(1);
    expect(wire.numFrames).toBe(1);
    // A triangle has exactly 3 unique edges.
    expect(wire.edges.length).toBe(3);
    // Vertices are decompressed with scale and translate.
    const all = wire.edges.flatMap(([a, b]) => [a, b]);
    expect(all.some(([x, y, z]) => x === 16 && y === 0 && z === 0)).toBe(true);
    expect(all.some(([x, y, z]) => x === 8 && y === 16 && z === 0)).toBe(true);
    expect(wire.bounds.min).toEqual([8, 0, 0]);
    expect(wire.bounds.max).toEqual([16, 16, 16]);
  });

  it('rejects bad idents and versions', () => {
    const bad = new ArrayBuffer(68);
    expect(() => parseMd2(bad)).toThrow('bad ident');
    const wrongVersion = syntheticMd2().slice(0);
    new DataView(wrongVersion).setInt32(4, 7, true);
    expect(() => parseMd2(wrongVersion)).toThrow('version');
  });

  it('rejects truncated data', () => {
    const full = syntheticMd2();
    expect(() => parseMd2(full.slice(0, 40))).toThrow();
    expect(() => parseMd2(full.slice(0, 100))).toThrow();
  });
});
