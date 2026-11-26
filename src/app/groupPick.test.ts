import { describe, expect, it } from 'vitest';
import { shortcutAction } from './shortcuts';
import {
  outermostGroupInScope,
  groupNodesPatch,
  setGroupFlagPatch,
  ungroupNodesPatch,
} from './groups';
import { applyPatch, buildDocument, createId, invertPatch, mergePatches } from '@core/doc/index';
import type { EntityNode, MapDocument } from '@core/types/index';
import { makeBox } from '@core/geom/__tests__/helpers';

function docWith(ids: string[]): MapDocument {
  const nodes = new Map();
  const world: EntityNode = {
    kind: 'entity',
    id: 'world',
    props: [['classname', 'worldspawn']],
    children: ids,
  };
  nodes.set('world', world);
  for (const id of ids) nodes.set(id, { ...makeBox([0, 0, 0], [64, 64, 64]), id });
  return buildDocument('world', nodes);
}

function docWithNested() {
  let doc = docWith(['b1']);
  const inner = createId();
  doc = applyPatch(doc, groupNodesPatch(doc, ['b1'], () => inner).patch);
  const outer = createId();
  doc = applyPatch(doc, groupNodesPatch(doc, [inner], () => outer).patch);
  return { doc, inner, outer };
}

describe('group-pick shortcuts (T1.13)', () => {
  it('maps G, Ctrl+G and Shift+G', () => {
    expect(shortcutAction({ key: 'g', ctrl: false, shift: false, alt: false })).toBe(
      'toggle-group-pick',
    );
    expect(shortcutAction({ key: 'g', ctrl: true, shift: false, alt: false })).toBe('group');
    expect(shortcutAction({ key: 'G', ctrl: false, shift: true, alt: false })).toBe('ungroup');
    expect(shortcutAction({ key: 'g', ctrl: true, shift: true, alt: false })).toBe(null);
  });
});

describe('outermostGroupInScope (T1.13)', () => {
  it('resolves nested groups to the outermost below the scope', () => {
    const { doc, outer } = docWithNested();
    expect(outermostGroupInScope(doc, 'b1', null)).toBe(outer);
  });

  it('stops at the scope: inside a group its members are individual', () => {
    const { doc, inner, outer } = docWithNested();
    expect(outermostGroupInScope(doc, 'b1', outer)).toBe(inner);
    expect(outermostGroupInScope(doc, 'b1', inner)).toBe(null);
  });

  it('reports locked and hidden groups as unselectable', () => {
    const { doc, outer } = docWithNested();
    const locked = applyPatch(doc, setGroupFlagPatch(doc, outer, 'locked', true));
    expect(outermostGroupInScope(locked, 'b1', null)).toBe('locked');
    const hidden = applyPatch(doc, setGroupFlagPatch(doc, outer, 'hidden', true));
    expect(outermostGroupInScope(hidden, 'b1', null)).toBe('locked');
  });

  it('a group-free brush resolves to null', () => {
    const doc = docWith(['b1']);
    expect(outermostGroupInScope(doc, 'b1', null)).toBe(null);
  });
});

describe('multi-ungroup (T1.13)', () => {
  it('chained ungroup patches dissolve several groups and invert exactly', () => {
    // Two independent groups dissolved in one merged patch — the shape the
    // editor's ungroupSelection builds.
    let doc = docWith(['b1', 'b2', 'b3', 'b4']);
    const g1 = createId();
    doc = applyPatch(doc, groupNodesPatch(doc, ['b1', 'b2'], () => g1).patch);
    const g2 = createId();
    doc = applyPatch(doc, groupNodesPatch(doc, ['b3', 'b4'], () => g2).patch);
    const before = doc;
    let patch = ungroupNodesPatch(doc, g1);
    doc = applyPatch(doc, patch);
    patch = mergePatches(patch, ungroupNodesPatch(doc, g2));
    doc = applyPatch(before, patch);
    expect(doc.nodes.has(g1)).toBe(false);
    expect(doc.nodes.has(g2)).toBe(false);
    // The merged inverse restores both groups exactly.
    const reverted = applyPatch(doc, invertPatch(patch));
    expect(reverted.nodes.has(g1)).toBe(true);
    expect(reverted.nodes.has(g2)).toBe(true);
    expect(reverted).toEqual(before);
  });
});
