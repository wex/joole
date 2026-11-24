import type { Id, MapDocument, MapNode } from './document';

export interface Patch {
  // the effect of one command
  before: Map<Id, MapNode | null>; // null = the node did not exist
  after: Map<Id, MapNode | null>; // null = the node was removed
  parentBefore: Map<Id, Id | null>;
  parentAfter: Map<Id, Id | null>;
}

export interface Command {
  label: string;
  mergeKey?: string;
  run(doc: Readonly<MapDocument>): Patch;
}
