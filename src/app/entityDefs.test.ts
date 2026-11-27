import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EditorApp } from './editor';

function createTestApp(): EditorApp {
  return new EditorApp({
    inflate: (data) => Promise.resolve(data),
    textureClient: {
      convert: () => Promise.reject(new Error('no textures in this test')),
    },
    textureCache: {
      get: () => Promise.resolve(null),
      put: () => Promise.resolve(),
    },
  });
}

describe('entity definitions in the app', () => {
  it('exposes the vanilla definitions by default', () => {
    const app = createTestApp();
    const names = new Set(app.entityDefs().map((def) => def.className));
    expect(names.has('worldspawn')).toBe(true);
    expect(names.has('monster_soldier')).toBe(true);
    expect(app.entityDefs().length).toBe(148);
  });

  it('a new document worldspawn has the verified gravity default', () => {
    const app = createTestApp();
    const project = JSON.parse(app.projectText()) as {
      document: { nodes: { kind: string; props?: [string, string][] }[] };
    };
    const world = project.document.nodes.find((node) =>
      node.props?.some(([key, value]) => key === 'classname' && value === 'worldspawn'),
    );
    expect(world?.props).toContainEqual(['gravity', '800']);
    expect(world?.props?.some(([key]) => key === 'sky')).toBe(false);
    expect(world?.props?.some(([key]) => key === 'message')).toBe(false);
  });

  it('placing a light writes compiler-verified creation defaults', () => {
    const app = createTestApp();
    const id = app.addEntityAt('light', [32, 32, 32]);
    expect(id).not.toBeNull();
    const project = JSON.parse(app.projectText()) as {
      document: { nodes: { id: string; props?: [string, string][] }[] };
    };
    const light = project.document.nodes.find((node) => node.id === id);
    expect(light?.props).toContainEqual(['light', '300']);
    expect(light?.props).toContainEqual(['_color', '1 1 1']);
    expect(light?.props).toContainEqual(['style', '0']);
    expect(light?.props).toContainEqual(['_cone', '10']);
  });

  it('merges mod definitions over the vanilla set', () => {
    const app = createTestApp();
    const ctf = readFileSync('tests/fixtures/quaked/ctf-blocks.c', 'utf8');
    app.setModEntityDefs([ctf]);
    const names = new Set(app.entityDefs().map((def) => def.className));
    expect(names.has('info_player_team1')).toBe(true);
    expect(names.has('misc_ctf_banner')).toBe(true);
    expect(app.entityDefs().length).toBeGreaterThan(148);
  });

  it('returns to vanilla with an empty mod list', () => {
    const app = createTestApp();
    const ctf = readFileSync('tests/fixtures/quaked/ctf-blocks.c', 'utf8');
    app.setModEntityDefs([ctf]);
    app.setModEntityDefs([]);
    expect(app.entityDefs().length).toBe(148);
  });

  it('stores the mod definition texts in the project file', () => {
    const app = createTestApp();
    const ctf = readFileSync('tests/fixtures/quaked/ctf-blocks.c', 'utf8');
    app.setModEntityDefs([ctf]);
    const project = JSON.parse(app.projectText()) as {
      editor?: { modEntityDefs?: string[] };
    };
    expect(project.editor?.modEntityDefs?.length).toBe(1);
    expect(project.editor?.modEntityDefs?.[0]).toContain('info_player_team1');
  });

  it('restores the mod definitions when the project is reopened', async () => {
    const app = createTestApp();
    const ctf = readFileSync('tests/fixtures/quaked/ctf-blocks.c', 'utf8');
    app.setModEntityDefs([ctf]);
    const text = app.projectText();
    const reopened = createTestApp();
    expect(await reopened.openProjectText('test.joole.json', text)).toBe(true);
    const names = new Set(reopened.entityDefs().map((def) => def.className));
    expect(names.has('info_player_team1')).toBe(true);
  });
});
