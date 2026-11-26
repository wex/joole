import { describe, expect, it } from 'vitest';
import { countNewErrors, newestLogId } from './logErrors';
import type { LogEntry } from './editor';

const entry = (id: number, level: LogEntry['level']): LogEntry => ({ id, level, text: 'x' });

describe('countNewErrors (T15.9)', () => {
  it('counts only error entries after the last-seen id', () => {
    const entries = [
      entry(1, 'error'),
      entry(2, 'info'),
      entry(3, 'error'),
      entry(4, 'warning'),
      entry(5, 'error'),
    ];
    expect(countNewErrors(entries, 1)).toBe(2);
    expect(countNewErrors(entries, 5)).toBe(0);
    expect(countNewErrors(entries, 0)).toBe(3);
  });

  it('is empty for an empty log', () => {
    expect(countNewErrors([], 0)).toBe(0);
  });
});

describe('newestLogId', () => {
  it('is the last id or 0', () => {
    expect(newestLogId([])).toBe(0);
    expect(newestLogId([entry(3, 'info'), entry(7, 'error')])).toBe(7);
  });
});
