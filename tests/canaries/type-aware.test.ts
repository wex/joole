import { ESLint } from 'eslint';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import tseslint from 'typescript-eslint';

const repoRoot = resolve(import.meta.dirname, '../..');
const fixture = 'tests/canaries/type-aware.fixture.ts';

describe('type-aware typescript-eslint canary', () => {
  it('runs a type-aware rule through the TypeScript 6 compiler API', async () => {
    const eslint = new ESLint({
      cwd: repoRoot,
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: [fixture],
          languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
              project: './tsconfig.test.json',
              tsconfigRootDir: repoRoot,
            },
          },
          plugins: {
            '@typescript-eslint': tseslint.plugin,
          },
          rules: {
            '@typescript-eslint/no-unnecessary-type-assertion': 'error',
          },
        },
      ],
    });

    const results = await eslint.lintFiles([fixture]);
    const messages = results.flatMap((result) => result.messages);

    expect(
      messages.some(
        (message) => message.ruleId === '@typescript-eslint/no-unnecessary-type-assertion',
      ),
    ).toBe(true);

    const require = createRequire(import.meta.url);
    const parserPackage = join(repoRoot, 'node_modules/@typescript-eslint/parser');
    const typeScriptPackagePath = require.resolve('typescript/package.json', {
      paths: [parserPackage],
    });
    const typeScriptPackage = JSON.parse(readFileSync(typeScriptPackagePath, 'utf8')) as {
      version: string;
    };

    expect(typeScriptPackage.version).toMatch(/^6\./);
  });
});
