import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expectCleanQbsp3, runQbsp3Oracle } from './runQbsp3';

describe('qbsp3 wasm oracle', () => {
  it('compiles the sealed room fixture without brush warnings or leaks', async () => {
    const result = await runQbsp3Oracle(readFileSync('tests/fixtures/room.map', 'utf8'), 'room', [
      'e2u1/mine10_1',
      'e2u1/mine10_2',
      'e2u1/glass',
      'e1u1/sky1',
      'e1u1/clip',
    ]);
    expect(() => expectCleanQbsp3(result)).not.toThrow();
    expect(result.bsp.byteLength).toBeGreaterThan(1024);
  });
});
