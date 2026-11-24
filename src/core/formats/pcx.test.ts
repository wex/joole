import { describe, expect, it } from 'vitest';
import { readPcxPalette, PcxFormatError } from './pcx';
import { fixtureBytes } from './__tests__/helpers';

describe('readPcxPalette', () => {
  it('reads 768 bytes after the 0x0C marker', () => {
    const palette = readPcxPalette(fixtureBytes('colormap.pcx'));
    expect(palette).toHaveLength(768);
    expect([palette[0], palette[1], palette[2]]).toEqual([0, 255, 0]);
    expect([palette[3], palette[4], palette[5]]).toEqual([1, 254, 0]);
  });

  it('rejects missing marker', () => {
    const bytes = fixtureBytes('colormap.pcx').slice();
    bytes[bytes.length - 769] = 0;
    expect(() => readPcxPalette(bytes)).toThrow(PcxFormatError);
  });

  it('rejects tiny files', () => {
    expect(() => readPcxPalette(new Uint8Array(100))).toThrow('too-small');
  });
});
