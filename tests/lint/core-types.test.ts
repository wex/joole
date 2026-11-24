import { ESLint } from 'eslint';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../..');
const eslint = new ESLint({ cwd: repoRoot });
const rule = 'no-restricted-syntax';

async function lintTypesFile(source: string) {
  const [result] = await eslint.lintText(source, {
    filePath: join(repoRoot, 'src/core/types/canary.ts'),
  });
  if (!result) {
    throw new Error('ESLint returned no result');
  }
  return result.messages;
}

describe('core/types type-only enforcement', () => {
  it('allows pure type declarations', async () => {
    const source = 'export type X = number;\nexport interface Y {\n  a: X;\n}\n';
    const messages = await lintTypesFile(source);
    expect(messages.filter((m) => m.ruleId === rule)).toHaveLength(0);
  });

  it.each([
    ['a variable', 'export const x = 1;\n'],
    ['a function', 'export function f(): number {\n  return 1;\n}\n'],
    ['a class', 'export class C {}\n'],
    ['an enum', 'export enum E {\n  A,\n}\n'],
    ['a side effect', 'export type X = number;\nconsole.log(1);\n'],
    ['a default export', 'export default 1;\n'],
  ])('rejects %s', async (_name, source) => {
    const messages = await lintTypesFile(source);
    expect(messages.some((m) => m.ruleId === rule)).toBe(true);
  });
});
