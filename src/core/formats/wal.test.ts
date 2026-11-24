import { describe, expect, it } from 'vitest';
import { readWalHeader, readWalMip0, WalFormatError } from './wal';
import { fixtureBytes } from './__tests__/helpers';

describe('readWalHeader', () => {
  it('reads the synthetic fixture header', () => {
    const header = readWalHeader(fixtureBytes('tiny.wal'));
    expect(header.name).toBe('e2u1/mine10_1');
    expect(header.width).toBe(4);
    expect(header.height).toBe(4);
    expect(header.offsets[0]).toBe(100);
    expect(header.flags).toBe(0x21);
    expect(header.contents).toBe(1);
    expect(header.value).toBe(7);
  });

  it('reads mip 0 pixels', () => {
    const bytes = fixtureBytes('tiny.wal');
    const mip = readWalMip0(bytes, readWalHeader(bytes));
    expect(mip).toHaveLength(16);
    expect(mip[0]).toBe(0);
    expect(mip[15]).toBe(15);
  });

  it('rejects short data', () => {
    expect(() => readWalHeader(new Uint8Array(50))).toThrow(WalFormatError);
  });
});
