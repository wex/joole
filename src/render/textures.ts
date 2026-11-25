import type { ConvertedTexture } from '@core/types/index';
import type { Rgba } from './colors';

/**
 * Loads a texture by its map name (for example "e1u1/floor1_3"). Resolves to
 * null when the game data has no such texture; the checker stays in place.
 * The application wires it to the VFS, the texture worker and the cache.
 */
export type TextureLoader = (name: string) => Promise<ConvertedTexture | null>;

export interface BoundTexture {
  readonly texture: WebGLTexture;
  /** The size the UVs are divided by: the .wal size, or the checker's. */
  readonly width: number;
  readonly height: number;
  readonly loaded: boolean;
}

/** The checker covers a 64 × 64 unit texture with 2 × 2 cells of 32 units. */
const PLACEHOLDER_SIZE = 64;

type Entry = { state: 'loading' } | { state: 'missing' } | { state: 'ready'; bound: BoundTexture };

/**
 * The GPU textures of the 3D view. A texture is requested lazily, the first
 * time a view needs it; until it arrives, and when it does not exist, faces
 * use the checker placeholder. Textures repeat, have generated mipmaps and
 * use NEAREST_MIPMAP_LINEAR for the authentic Q2 look.
 */
export class TextureManager {
  private readonly entries = new Map<string, Entry>();
  private placeholderTexture: WebGLTexture;
  private pendingCount = 0;
  private disposed = false;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly loader: TextureLoader | null,
    private readonly onChange: () => void,
    colors: readonly [Rgba, Rgba],
  ) {
    this.placeholderTexture = this.createPlaceholder(colors);
  }

  /** The number of requested textures that have not arrived yet. */
  get pending(): number {
    return this.pendingCount;
  }

  /** The names and sizes of the textures uploaded so far. */
  loadedTextures(): { name: string; width: number; height: number }[] {
    const list: { name: string; width: number; height: number }[] = [];
    for (const [name, entry] of this.entries) {
      if (entry.state === 'ready') {
        list.push({ name, width: entry.bound.width, height: entry.bound.height });
      }
    }
    return list;
  }

  /** The texture to bind for a name, requesting it on first use. */
  get(name: string): BoundTexture {
    const entry = this.entries.get(name);
    if (entry?.state === 'ready') {
      return entry.bound;
    }
    if (!entry && this.loader) {
      this.request(name, this.loader);
    }
    return this.placeholder;
  }

  get placeholder(): BoundTexture {
    return {
      texture: this.placeholderTexture,
      width: PLACEHOLDER_SIZE,
      height: PLACEHOLDER_SIZE,
      loaded: false,
    };
  }

  /** Rebuilds the checker after a theme change. */
  setPlaceholderColors(colors: readonly [Rgba, Rgba]): void {
    this.gl.deleteTexture(this.placeholderTexture);
    this.placeholderTexture = this.createPlaceholder(colors);
  }

  dispose(): void {
    this.disposed = true;
    for (const entry of this.entries.values()) {
      if (entry.state === 'ready') {
        this.gl.deleteTexture(entry.bound.texture);
      }
    }
    this.entries.clear();
    this.gl.deleteTexture(this.placeholderTexture);
  }

  private request(name: string, loader: TextureLoader): void {
    this.entries.set(name, { state: 'loading' });
    this.pendingCount++;
    const settle = (entry: Entry) => {
      this.pendingCount--;
      if (this.disposed) {
        return;
      }
      this.entries.set(name, entry);
      this.onChange();
    };
    loader(name).then(
      (converted) =>
        settle(
          converted ? { state: 'ready', bound: this.upload(converted) } : { state: 'missing' },
        ),
      () => settle({ state: 'missing' }),
    );
  }

  private upload(converted: ConvertedTexture): BoundTexture {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      converted.width,
      converted.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      converted.rgba,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.generateMipmap(gl.TEXTURE_2D);
    return { texture, width: converted.width, height: converted.height, loaded: true };
  }

  private createPlaceholder([dark, light]: readonly [Rgba, Rgba]): WebGLTexture {
    const gl = this.gl;
    const bytes = (c: Rgba) => c.map((v) => Math.round(v * 255));
    const a = bytes(dark);
    const b = bytes(light);
    const pixels = new Uint8Array([...a, ...b, ...b, ...a]);
    for (let i = 3; i < pixels.length; i += 4) {
      pixels[i] = 255;
    }
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.generateMipmap(gl.TEXTURE_2D);
    return texture;
  }
}
