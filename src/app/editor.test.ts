import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { convertWalToRgba } from '@core/formats/index';
import type { ByteSource, ConvertedTexture } from '@core/types/index';
import { EditorApp } from './editor';

function source(bytes: Uint8Array): ByteSource {
  return {
    size: bytes.byteLength,
    read: (offset, length) => Promise.resolve(bytes.slice(offset, offset + length)),
  };
}

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(`tests/fixtures/${name}`));
}

function textureGameEntries() {
  return [
    { path: 'baseq2/pics/colormap.pcx', source: source(fixture('colormap.pcx')) },
    { path: 'baseq2/textures/e2u1/mine10_1.wal', source: source(fixture('harness.wal')) },
  ];
}

function makeApp() {
  let conversions = 0;
  const cache = new Map<string, ConvertedTexture>();
  const app = new EditorApp({
    inflate: (data) => Promise.resolve(data),
    textureClient: {
      convert: (wal, palette) => {
        conversions++;
        return Promise.resolve(convertWalToRgba(new Uint8Array(wal), new Uint8Array(palette)));
      },
    },
    textureCache: {
      get: (key) => Promise.resolve(cache.get(key) ?? null),
      put: (key, texture) => {
        cache.set(key, texture);
        return Promise.resolve();
      },
    },
  });
  return {
    app,
    cache,
    conversionCount: () => conversions,
  };
}

describe('EditorApp', () => {
  it('opens a valid map, reports it and emits a document event', async () => {
    const { app } = makeApp();
    const events: string[] = [];
    app.subscribe((event) => events.push(event.type));

    expect(
      await app.openMapText('simple.map', new TextDecoder().decode(fixture('simple.map'))),
    ).toBe(true);

    expect(app.mapName).toBe('simple.map');
    expect(app.document.nodes.size).toBeGreaterThan(1);
    expect(events).toContain('document');
    expect(app.logEntries().at(-1)).toMatchObject({ level: 'ok' });
    expect(app.logEntries().at(-1)?.text).toContain('Opened map simple.map');
  });

  it('rejects an invalid map without replacing the current document', async () => {
    const { app } = makeApp();
    const before = app.document;

    expect(await app.openMapText('broken.map', '{ "classname" "worldspawn"')).toBe(false);

    expect(app.document).toBe(before);
    expect(app.mapName).toBeNull();
    expect(app.logEntries().at(-1)?.level).toBe('error');
    expect(app.logEntries().at(-1)?.text).toContain('Map failed to open');
  });

  it('opens game data, reads the palette and indexes textures', async () => {
    const { app } = makeApp();
    const events: string[] = [];
    app.subscribe((event) => events.push(event.type));

    expect(await app.openGameEntries(textureGameEntries(), 'fixture game')).toBe(true);

    expect(app.gameOpen).toBe(true);
    expect(app.textureCount).toBe(1);
    expect(events).toContain('game');
    expect(app.logEntries().at(-1)?.text).toBe('Game data opened: 1 texture.');
  });

  it('rejects files without a baseq2 directory and says what to choose', async () => {
    const { app } = makeApp();

    expect(await app.openGameEntries([], 'empty')).toBe(false);

    expect(app.gameOpen).toBe(false);
    expect(app.logEntries().at(-1)?.level).toBe('error');
    expect(app.logEntries().at(-1)?.text).toContain('Choose the Quake 2 folder');
  });

  it('loads a texture through the worker once and then uses the cache', async () => {
    const { app, conversionCount } = makeApp();
    await app.openGameEntries(textureGameEntries(), 'fixture game');

    const first = await app.loadTexture('e2u1/mine10_1');
    const second = await app.loadTexture('e2u1/mine10_1');

    expect(first).toMatchObject({ width: 64, height: 64 });
    expect(second).toMatchObject({ width: 64, height: 64 });
    expect(conversionCount()).toBe(1);
  });

  it('keeps grid sizes to powers of two from 1 to 256', () => {
    const { app } = makeApp();

    expect(app.setGridSize(8)).toBe(true);
    expect(app.gridSize).toBe(8);
    expect(app.setGridSize(12)).toBe(false);
    expect(app.gridSize).toBe(8);
    expect(app.setGridSize(512)).toBe(false);
    expect(app.setGridSize(1)).toBe(true);
    expect(app.increaseGridSize()).toBe(true);
    expect(app.gridSize).toBe(2);
    app.setGridSize(256);
    expect(app.increaseGridSize()).toBe(true);
    expect(app.gridSize).toBe(256);
    expect(app.decreaseGridSize()).toBe(true);
    expect(app.gridSize).toBe(128);
  });

  it('caps the log and keeps the newest entries', () => {
    const { app } = makeApp();
    for (let i = 0; i < 510; i++) {
      app.log('info', `line ${i}`);
    }

    const entries = app.logEntries();
    expect(entries).toHaveLength(500);
    expect(entries[0]?.text).toBe('line 10');
    expect(entries.at(-1)?.text).toBe('line 509');
  });
});
