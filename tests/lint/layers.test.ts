import { ESLint } from 'eslint';
import type { Linter } from 'eslint';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../..');
const eslint = new ESLint({ cwd: repoRoot });
const layerRule = 'import-x/no-restricted-paths';
const packageRule = 'no-restricted-imports';

interface LayerCase {
  name: string;
  file: string;
  importPath: string;
  allowed: boolean;
}

async function lintVirtual(file: string, importPath: string) {
  const source = `import ${JSON.stringify(importPath)};\n`;
  const [result] = await eslint.lintText(source, { filePath: join(repoRoot, file) });
  if (!result) {
    throw new Error(`ESLint returned no result for ${file}`);
  }
  return result.messages;
}

function expectLayerRule(messages: Linter.LintMessage[], testCase: LayerCase) {
  const violations = messages.filter((message) => message.ruleId === layerRule);
  if (testCase.allowed) {
    expect(violations, `${testCase.name} should be allowed`).toHaveLength(0);
  } else {
    expect(violations, `${testCase.name} should be forbidden`).not.toHaveLength(0);
  }
}

const layerCases: LayerCase[] = [
  // UI: everything except workers is allowed.
  { name: 'ui -> app', file: 'src/ui/canary.ts', importPath: '@app/index', allowed: true },
  { name: 'ui -> render', file: 'src/ui/canary.ts', importPath: '@render/index', allowed: true },
  {
    name: 'ui -> platform',
    file: 'src/ui/canary.ts',
    importPath: '@platform/index',
    allowed: true,
  },
  { name: 'ui -> game', file: 'src/ui/canary.ts', importPath: '@game/q2/index', allowed: true },
  { name: 'ui -> core', file: 'src/ui/canary.ts', importPath: '@core/types/index', allowed: true },
  {
    name: 'ui -> workers',
    file: 'src/ui/canary.ts',
    importPath: '../../workers/index',
    allowed: false,
  },

  // Application: platform, game and core are allowed; ui and workers are not.
  { name: 'app -> render', file: 'src/app/canary.ts', importPath: '@render/index', allowed: true },
  {
    name: 'app -> platform',
    file: 'src/app/canary.ts',
    importPath: '@platform/index',
    allowed: true,
  },
  { name: 'app -> game', file: 'src/app/canary.ts', importPath: '@game/q2/index', allowed: true },
  {
    name: 'app -> core',
    file: 'src/app/canary.ts',
    importPath: '@core/types/index',
    allowed: true,
  },
  { name: 'app -> ui', file: 'src/app/canary.ts', importPath: '@ui/index', allowed: false },
  {
    name: 'app -> workers',
    file: 'src/app/canary.ts',
    importPath: '../../workers/index',
    allowed: false,
  },

  // Render: platform, game and core are allowed; app, ui and workers are not.
  {
    name: 'render -> platform',
    file: 'src/render/canary.ts',
    importPath: '@platform/index',
    allowed: true,
  },
  {
    name: 'render -> game',
    file: 'src/render/canary.ts',
    importPath: '@game/q2/index',
    allowed: true,
  },
  {
    name: 'render -> core',
    file: 'src/render/canary.ts',
    importPath: '@core/types/index',
    allowed: true,
  },
  { name: 'render -> app', file: 'src/render/canary.ts', importPath: '@app/index', allowed: false },
  { name: 'render -> ui', file: 'src/render/canary.ts', importPath: '@ui/index', allowed: false },
  {
    name: 'render -> workers',
    file: 'src/render/canary.ts',
    importPath: '../../workers/index',
    allowed: false,
  },

  // Platform: game and core are allowed; app, ui, render and workers are not.
  {
    name: 'platform -> game',
    file: 'src/platform/canary.ts',
    importPath: '@game/q2/index',
    allowed: true,
  },
  {
    name: 'platform -> core',
    file: 'src/platform/canary.ts',
    importPath: '@core/types/index',
    allowed: true,
  },
  {
    name: 'platform -> app',
    file: 'src/platform/canary.ts',
    importPath: '@app/index',
    allowed: false,
  },
  {
    name: 'platform -> ui',
    file: 'src/platform/canary.ts',
    importPath: '@ui/index',
    allowed: false,
  },
  {
    name: 'platform -> render',
    file: 'src/platform/canary.ts',
    importPath: '@render/index',
    allowed: false,
  },
  {
    name: 'platform -> workers',
    file: 'src/platform/canary.ts',
    importPath: '../../workers/index',
    allowed: false,
  },

  // Workers: only game and core are allowed.
  {
    name: 'workers -> game',
    file: 'workers/canary.ts',
    importPath: '@game/q2/index',
    allowed: true,
  },
  {
    name: 'workers -> core',
    file: 'workers/canary.ts',
    importPath: '@core/types/index',
    allowed: true,
  },
  { name: 'workers -> app', file: 'workers/canary.ts', importPath: '@app/index', allowed: false },
  {
    name: 'workers -> render',
    file: 'workers/canary.ts',
    importPath: '@render/index',
    allowed: false,
  },
  {
    name: 'workers -> platform',
    file: 'workers/canary.ts',
    importPath: '@platform/index',
    allowed: false,
  },
  { name: 'workers -> ui', file: 'workers/canary.ts', importPath: '@ui/index', allowed: false },

  // Game: only core is allowed.
  {
    name: 'game -> core',
    file: 'src/game/q2/canary.ts',
    importPath: '@core/types/index',
    allowed: true,
  },
  { name: 'game -> app', file: 'src/game/q2/canary.ts', importPath: '@app/index', allowed: false },
  {
    name: 'game -> render',
    file: 'src/game/q2/canary.ts',
    importPath: '@render/index',
    allowed: false,
  },
  {
    name: 'game -> platform',
    file: 'src/game/q2/canary.ts',
    importPath: '@platform/index',
    allowed: false,
  },
  { name: 'game -> ui', file: 'src/game/q2/canary.ts', importPath: '@ui/index', allowed: false },
  {
    name: 'game -> workers',
    file: 'src/game/q2/canary.ts',
    importPath: '../../../workers/index',
    allowed: false,
  },

  // Core: no upper layer is allowed.
  {
    name: 'core -> game',
    file: 'src/core/canary.ts',
    importPath: '@game/q2/index',
    allowed: false,
  },
  { name: 'core -> app', file: 'src/core/canary.ts', importPath: '@app/index', allowed: false },
  {
    name: 'core -> render',
    file: 'src/core/canary.ts',
    importPath: '@render/index',
    allowed: false,
  },
  {
    name: 'core -> platform',
    file: 'src/core/canary.ts',
    importPath: '@platform/index',
    allowed: false,
  },
  { name: 'core -> ui', file: 'src/core/canary.ts', importPath: '@ui/index', allowed: false },
  {
    name: 'core -> workers',
    file: 'src/core/canary.ts',
    importPath: '../../workers/index',
    allowed: false,
  },
  {
    name: 'core -> core',
    file: 'src/core/canary.ts',
    importPath: '@core/geom/index',
    allowed: true,
  },

  // The core's internal order is types <- geom <- doc <- formats.
  {
    name: 'types -> geom',
    file: 'src/core/types/canary.ts',
    importPath: '@core/geom/index',
    allowed: false,
  },
  {
    name: 'types -> doc',
    file: 'src/core/types/canary.ts',
    importPath: '@core/doc/index',
    allowed: false,
  },
  {
    name: 'types -> formats',
    file: 'src/core/types/canary.ts',
    importPath: '@core/formats/index',
    allowed: false,
  },
  {
    name: 'geom -> types',
    file: 'src/core/geom/canary.ts',
    importPath: '@core/types/index',
    allowed: true,
  },
  {
    name: 'geom -> doc',
    file: 'src/core/geom/canary.ts',
    importPath: '@core/doc/index',
    allowed: false,
  },
  {
    name: 'geom -> formats',
    file: 'src/core/geom/canary.ts',
    importPath: '@core/formats/index',
    allowed: false,
  },
  {
    name: 'doc -> types',
    file: 'src/core/doc/canary.ts',
    importPath: '@core/types/index',
    allowed: true,
  },
  {
    name: 'doc -> geom',
    file: 'src/core/doc/canary.ts',
    importPath: '@core/geom/index',
    allowed: true,
  },
  {
    name: 'doc -> formats',
    file: 'src/core/doc/canary.ts',
    importPath: '@core/formats/index',
    allowed: false,
  },
  {
    name: 'formats -> types',
    file: 'src/core/formats/canary.ts',
    importPath: '@core/types/index',
    allowed: true,
  },
  {
    name: 'formats -> geom',
    file: 'src/core/formats/canary.ts',
    importPath: '@core/geom/index',
    allowed: true,
  },
  {
    name: 'formats -> doc',
    file: 'src/core/formats/canary.ts',
    importPath: '@core/doc/index',
    allowed: true,
  },
];

describe('layer import rules', () => {
  it.each(layerCases)('$name', async (testCase) => {
    const messages = await lintVirtual(testCase.file, testCase.importPath);
    expectLayerRule(messages, testCase);
  });

  it.each([
    {
      name: 'solid-js outside ui',
      file: 'src/app/canary.ts',
      importPath: 'solid-js',
      allowed: false,
    },
    {
      name: '@solidjs/web outside ui',
      file: 'src/render/canary.ts',
      importPath: '@solidjs/web',
      allowed: false,
    },
    { name: 'solid-js in ui', file: 'src/ui/canary.ts', importPath: 'solid-js', allowed: true },
    {
      name: '@solidjs/web in ui',
      file: 'src/ui/canary.ts',
      importPath: '@solidjs/web',
      allowed: true,
    },
  ])('$name', async (testCase) => {
    const messages = await lintVirtual(testCase.file, testCase.importPath);
    const violations = messages.filter((message) => message.ruleId === packageRule);
    if (testCase.allowed) {
      expect(violations).toHaveLength(0);
    } else {
      expect(violations).not.toHaveLength(0);
    }
  });
});
