import { describe, expect, it } from 'vitest';
import { readPkzDirectory, readPkzFile, PkzFormatError } from './pkz';
import { fixtureSource, memByteSource, nodeInflate } from './__tests__/helpers';

describe('readPkzDirectory', () => {
  it('reads both entries of the synthetic fixture', async () => {
    const entries = await readPkzDirectory(fixtureSource('tiny.pkz'));
    expect(entries).toHaveLength(2);
    expect(entries[0]!.name).toBe('stored.txt');
    expect(entries[0]!.method).toBe(0);
    expect(entries[1]!.name).toBe('deflated.txt');
    expect(entries[1]!.method).toBe(8);
  });

  it('rejects non-zip data', async () => {
    await expect(readPkzDirectory(memByteSource(new Uint8Array(200)))).rejects.toThrow(
      PkzFormatError,
    );
  });
});

describe('readPkzFile', () => {
  it('reads a stored entry verbatim', async () => {
    const source = fixtureSource('tiny.pkz');
    const entries = await readPkzDirectory(source);
    const data = await readPkzFile(source, entries[0]!, nodeInflate);
    expect(new TextDecoder().decode(data)).toBe('stored contents\n');
  });

  it('inflates a deflate entry through the injected Inflate', async () => {
    const source = fixtureSource('tiny.pkz');
    const entries = await readPkzDirectory(source);
    const data = await readPkzFile(source, entries[1]!, nodeInflate);
    expect(new TextDecoder().decode(data)).toBe('deflated contents, deflated contents\n');
  });
});
