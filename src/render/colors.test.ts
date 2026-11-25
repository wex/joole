import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCssColor, readViewportColors, VIEWPORT_COLOR_TOKENS } from './colors';

describe('parseCssColor', () => {
  it('parses the hex forms', () => {
    expect(parseCssColor('#ff0000')).toEqual([1, 0, 0, 1]);
    expect(parseCssColor(' #FFF ')).toEqual([1, 1, 1, 1]);
    expect(parseCssColor('#00000080')).toEqual([0, 0, 0, 128 / 255]);
    expect(parseCssColor('#0f08')).toEqual([0, 1, 0, 136 / 255]);
  });

  it('parses rgb() and rgba() with commas or spaces', () => {
    expect(parseCssColor('rgb(255, 0, 0)')).toEqual([1, 0, 0, 1]);
    expect(parseCssColor('rgba(0, 0, 0, 0.55)')).toEqual([0, 0, 0, 0.55]);
    expect(parseCssColor('rgb(0 255 0 / 50%)')).toEqual([0, 1, 0, 0.5]);
  });

  it('rejects other values', () => {
    expect(parseCssColor('')).toBeNull();
    expect(parseCssColor('red')).toBeNull();
    expect(parseCssColor('#12345')).toBeNull();
    expect(parseCssColor('rgb(1, 2)')).toBeNull();
  });
});

describe('readViewportColors', () => {
  it('reads every token from a computed style', () => {
    const style = {
      getPropertyValue: (name: string) => (name === '--vp-select' ? ' #ff2b1f' : '#000'),
    };
    const colors = readViewportColors(style);
    expect(colors['vp-select'][0]).toBe(1);
    expect(colors['vp-bg']).toEqual([0, 0, 0, 1]);
  });

  it('fails loudly when the token file is not loaded', () => {
    expect(() => readViewportColors({ getPropertyValue: () => '' })).toThrow('--vp-bg');
  });

  it('every token is defined as a colour in both themes of tokens.css', () => {
    const css = readFileSync('docs/design-system/tokens.css', 'utf8');
    const blocks = css.split(/\[data-theme='light'\]/);
    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      for (const token of VIEWPORT_COLOR_TOKENS) {
        const value = new RegExp(`--${token}:\\s*([^;]+);`).exec(block)?.[1];
        expect(value, `--${token}`).toBeDefined();
        expect(parseCssColor(value!), `--${token}`).not.toBeNull();
      }
    }
  });
});
