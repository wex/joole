import { buildDocument } from '@core/doc/index';
import type { MapDocument, MapNode } from '@core/types/index';

export interface JooleProject {
  readonly format: 'joole-project';
  readonly version: number;
  readonly game: { readonly baseDir: string; readonly modDir?: string };
  readonly document: {
    readonly worldspawn: string;
    readonly nodes: readonly MapNode[];
  };
  readonly editor?: Record<string, unknown>;
}

export const PROJECT_VERSION = 1;

/** Serialises the document without rounding: JSON numbers carry float64 exactly enough for a round trip. */
export function writeProject(
  doc: Readonly<MapDocument>,
  editor: Record<string, unknown> = {},
): string {
  const project: JooleProject = {
    format: 'joole-project',
    version: PROJECT_VERSION,
    game: { baseDir: 'baseq2' },
    document: { worldspawn: doc.worldspawn, nodes: [...doc.nodes.values()] },
    editor,
  };
  return `${JSON.stringify(project, null, 2)}\n`;
}

type Migration = (value: Record<string, unknown>) => Record<string, unknown>;
const migrations = new Map<number, Migration>();

/** Applies the version-upgrade chain. Version 1 is current, so the chain is initially empty but versioned. */
export function migrateProject(value: Record<string, unknown>): Record<string, unknown> {
  if (value.format !== 'joole-project') throw new Error('not a Joole project');
  let version = value.version;
  if (!Number.isInteger(version) || (version as number) < 1)
    throw new Error('unsupported project version');
  let current = value;
  while ((version as number) < PROJECT_VERSION) {
    const migrate = migrations.get(version as number);
    if (!migrate) throw new Error(`missing project migration from version ${version}`);
    current = migrate(current);
    version = current.version;
  }
  if (version !== PROJECT_VERSION) throw new Error('unsupported project version');
  return current;
}

export function readProject(text: string): MapDocument {
  const value = migrateProject(
    JSON.parse(text) as Record<string, unknown>,
  ) as unknown as JooleProject;
  const nodes = new Map(value.document.nodes.map((node) => [node.id, node]));
  return buildDocument(value.document.worldspawn, nodes);
}
