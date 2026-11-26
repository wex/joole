import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COLOR_TOKENS, defaultColor, isHexColor } from './colors';
import { parseSettings } from './settings';

interface TokensJson {
  color: { tokens: { name: string; value: { dark: string; light: string } }[] };
}

const tokensJson = JSON.parse(
  readFileSync(new URL('../../docs/design-system/tokens.json', import.meta.url), 'utf8'),
) as TokensJson;

describe('COLOR_TOKENS (T15.10)', () => {
  it('covers every colour token of tokens.json for both themes', () => {
    expect(COLOR_TOKENS.length).toBe(tokensJson.color.tokens.length);
    for (const token of tokensJson.color.tokens) {
      const entry = COLOR_TOKENS.find((t) => t.name === token.name);
      expect(entry, token.name).toBeDefined();
      expect(entry!.dark).toBe(token.value.dark);
      expect(entry!.light).toBe(token.value.light);
    }
  });

  it('splits tokens into the views and interface groups', () => {
    for (const token of COLOR_TOKENS) {
      expect(token.group).toBe(token.name.startsWith('vp-') ? 'views' : 'interface');
    }
  });
});

describe('isHexColor', () => {
  it('accepts six-digit hex only', () => {
    expect(isHexColor('#ff2b1f')).toBe(true);
    expect(isHexColor('#FF2B1F')).toBe(true);
    expect(isHexColor('red')).toBe(false);
    expect(isHexColor('#fff')).toBe(false);
    expect(isHexColor(42)).toBe(false);
  });
});

describe('parseSettings colors', () => {
  it('defaults to empty overrides', () => {
    expect(parseSettings(null).colors).toEqual({ dark: {}, light: {} });
  });

  it('keeps valid overrides and drops unknown tokens and bad values', () => {
    const parsed = parseSettings({
      colors: {
        dark: { 'vp-select': '#0000ff', 'not-a-token': '#123456', 'vp-bg': 'blue' },
        light: { 'surface-1': '#ABCDEF' },
      },
    });
    expect(parsed.colors.dark).toEqual({ 'vp-select': '#0000ff' });
    expect(parsed.colors.light).toEqual({ 'surface-1': '#abcdef' });
  });

  it('falls back to empty for a malformed colors object', () => {
    expect(parseSettings({ colors: 'red' }).colors).toEqual({ dark: {}, light: {} });
    expect(parseSettings({ colors: { dark: {} } }).colors).toEqual({ dark: {}, light: {} });
  });
});

describe('defaultColor', () => {
  it('returns the token default per theme', () => {
    expect(defaultColor('vp-select', 'dark')).toBe(
      COLOR_TOKENS.find((t) => t.name === 'vp-select')!.dark,
    );
  });
});
