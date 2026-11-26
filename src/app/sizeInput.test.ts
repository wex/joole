import { describe, expect, it } from 'vitest';
import { formatSize, parseSizeInput, sizeAxes } from './sizeInput';

describe('parseSizeInput (T15.4)', () => {
  it('accepts spaces, commas or both between three sizes', () => {
    for (const text of ['128 64 32', '128,64,32', '128, 64, 32', '  128  64,32  ']) {
      expect(parseSizeInput(text)).toEqual({ ok: true, value: [128, 64, 32] });
    }
  });

  it('keeps decimals as typed', () => {
    expect(parseSizeInput('12.5 8 0.25')).toEqual({ ok: true, value: [12.5, 8, 0.25] });
  });

  it('rejects the wrong count, zero, negative and junk', () => {
    for (const text of [
      '',
      '128',
      '128 64',
      '1 2 3 4',
      '0 64 64',
      '-8 64 64',
      'a b c',
      '64 64 1e999',
    ]) {
      const result = parseSizeInput(text);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('Enter three sizes, such as 128 64 32');
    }
  });
});

describe('sizeAxes (T15.4)', () => {
  it('maps width, height and depth to the view axes', () => {
    expect(sizeAxes('xy')).toEqual([0, 1, 2]);
    expect(sizeAxes('xz')).toEqual([0, 2, 1]);
    expect(sizeAxes('yz')).toEqual([1, 2, 0]);
  });
});

describe('formatSize (T15.4)', () => {
  it('writes the sizes with trailing zeros trimmed', () => {
    expect(formatSize([128, 64.5, 32.25])).toBe('128 64.5 32.25');
    expect(formatSize([1 / 3, 8, 8])).toBe('0.3333 8 8');
  });
});
