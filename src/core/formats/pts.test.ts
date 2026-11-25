import { describe, expect, it } from 'vitest';
import { parsePts } from './pts';

describe('parsePts', () => {
  it('parses the qbsp3 point line format', () => {
    const pts = parsePts('64.000000 128.000000 24.000000\n300.5 -12.25 0\n');
    expect(pts).toEqual([
      [64, 128, 24],
      [300.5, -12.25, 0],
    ]);
  });

  it('ignores blank lines and rejects malformed ones', () => {
    expect(parsePts('\n1 2 3\n\n')).toEqual([[1, 2, 3]]);
    expect(() => parsePts('1 2\n')).toThrow('bad pointfile');
    expect(() => parsePts('a b c\n')).toThrow('bad pointfile');
  });
});
