import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../..');
const tsc = join(repoRoot, 'node_modules/typescript7/bin/tsc');

describe('core DOM canary', () => {
  it('rejects DOM globals in the core TypeScript project', () => {
    const canary = join(repoRoot, 'src/core', `dom-canary-${randomUUID()}.ts`);
    writeFileSync(canary, 'document.body;\n');

    try {
      const result = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.core.json', '--noEmit'], {
        cwd: repoRoot,
        encoding: 'utf8',
      });
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).not.toBe(0);
      expect(output).toContain("Cannot find name 'document'");
    } finally {
      rmSync(canary, { force: true });
    }
  });
});
