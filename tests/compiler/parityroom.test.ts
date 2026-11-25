import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expectCleanQbsp3, runQbsp3Oracle } from './runQbsp3';

describe('parity-room fixture', () => {
  it('compiles sealed without warnings, and the bsp is written for the manual q2pro check', async () => {
    const mapText = readFileSync('tests/fixtures/parity-room.map', 'utf8');
    const result = await runQbsp3Oracle(mapText, 'parity-room', ['e2u1/mine10_1']);
    expect(() => expectCleanQbsp3(result)).not.toThrow();
    expect(result.bsp.byteLength).toBeGreaterThan(1024);
    mkdirSync('tests/fixtures/generated', { recursive: true });
    writeFileSync('tests/fixtures/generated/parity-room.bsp', Buffer.from(result.bsp));
  }, 30000);
});
