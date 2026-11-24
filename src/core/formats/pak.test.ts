import { describe, expect, it } from 'vitest';
import { readPakDirectory, readPakFile, PakFormatError } from './pak';
import { fixtureSource, memByteSource } from './__tests__/helpers';

describe('readPakDirectory', () => {
  it('reads the synthetic fixture', async () => {
    const entries = await readPakDirectory(fixtureSource('tiny.pak'));
    expect(entries).toHaveLength(1);
    expect(entries[0]!.name).toBe('test/hello.txt');
    expect(entries[0]!.length).toBe(10);
  });

  it('reads file contents through the entry', async () => {
    const source = fixtureSource('tiny.pak');
    const entries = await readPakDirectory(source);
    const data = await readPakFile(source, entries[0]!);
    expect(new TextDecoder().decode(data)).toBe('hello pak\n');
  });

  it('rejects a bad ident', async () => {
    const bad = new Uint8Array(100);
    await expect(readPakDirectory(memByteSource(bad))).rejects.toThrow(PakFormatError);
  });

  it('rejects a truncated file', async () => {
    await expect(readPakDirectory(memByteSource(new Uint8Array(4)))).rejects.toThrow('bad-ident');
  });
});
