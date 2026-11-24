import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { importX } from 'eslint-plugin-import-x';
import solidV2 from 'eslint-plugin-solid/configs/v2';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

const typeScriptFiles = ['**/*.{ts,tsx,mts,cts}'];
const sourceFiles = ['src/**/*.{ts,tsx}', 'workers/**/*.ts'];

export default tseslint.config(
  {
    ignores: [
      'ext/**',
      'dist/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.tsbuild/**',
      '.agents/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: typeScriptFiles,
    plugins: {
      'import-x': importX,
    },
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
        }),
      ],
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      'import-x/no-restricted-paths': [
        'error',
        {
          basePath: import.meta.dirname,
          zones: [
            {
              target: './src/core',
              from: [
                './src/game',
                './src/app',
                './src/render',
                './src/platform',
                './src/ui',
                './workers',
              ],
            },
            {
              target: './src/core/types',
              from: ['./src/core/geom', './src/core/doc', './src/core/formats'],
            },
            {
              target: './src/core/geom',
              from: ['./src/core/doc', './src/core/formats'],
            },
            { target: './src/core/doc', from: './src/core/formats' },
            {
              target: './src/game',
              from: ['./src/app', './src/render', './src/platform', './src/ui', './workers'],
            },
            { target: ['./src/render', './src/platform'], from: ['./src/app', './src/ui'] },
            { target: './src/platform', from: './src/render' },
            { target: './src/app', from: './src/ui' },
            {
              target: './workers',
              from: ['./src/app', './src/ui', './src/render', './src/platform'],
            },
            {
              target: ['./src/app', './src/render', './src/platform', './src/ui'],
              from: './workers',
            },
          ],
        },
      ],
    },
  },
  {
    files: sourceFiles,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'solid-js',
              message: 'Solid is limited to the ui layer.',
            },
          ],
          patterns: [
            {
              group: ['@solidjs/*'],
              message: 'Solid is limited to the ui layer.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    ...solidV2,
    rules: {
      ...solidV2.rules,
      'no-restricted-imports': 'off',
    },
  },
  eslintConfigPrettier,
);
