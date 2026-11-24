import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPakDirectory, readPakFile } from './pak';
import { readWalHeader, readWalMip0 } from './wal';
import { memByteSource } from './__tests__/helpers';

const q2dir = process.env.JOOLE_Q2_DIR;

// skipped unless JOOLE_Q2_DIR points at a Quake 2 installation
describe.skipIf(!q2dir)('pak0.pak game data', () => {
  it('decodes every vanilla texture', async () => {
    const source = memByteSource(new Uint8Array(readFileSync(join(q2dir!, 'baseq2', 'pak0.pak'))));
    const entries = await readPakDirectory(source);
    const wals = entries.filter((e) => e.name.toLowerCase().endsWith('.wal'));
    expect(wals.length).toBeGreaterThan(100);
    let pixels = 0;
    for (const entry of wals) {
      const bytes = await readPakFile(source, entry);
      const header = readWalHeader(bytes);
      expect(header.width).toBeGreaterThan(0);
      const mip = readWalMip0(bytes, header);
      expect(mip.length).toBe(header.width * header.height);
      pixels += mip.length;
    }
    console.error(`decoded ${wals.length} textures, ${pixels} pixels`);
  });
});
