// The written shape of a league's design (record 073): what may be stored and drawn.
import { describe, expect, it } from 'vitest';
import {
  designDocumentSchema,
  isStartingDesignKey,
  neutralStartingDesign,
  parseDesignDocument,
  startingDesign,
  startingDesignKeys,
  startingDesignWith,
} from './site-design.ts';

/** Text that would end a style rule, close the style element, or fetch from elsewhere. */
const hostileValues = [
  'red; } body { display:none',
  '#1f5fbf; } body { display:none',
  '</style><script>alert(1)</script>',
  'url(http://example.test/x.png)',
  'expression(alert(1))',
  `#${'a'.repeat(10_000)}`,
  '#1f5fbf\n',
  ' #1f5fbf',
  '#1f5fb',
  '',
];

describe('the design document', () => {
  it('accepts every starting design, and the neutral one is among them', () => {
    for (const key of startingDesignKeys) {
      expect(parseDesignDocument(startingDesign(key)).ok).toBe(true);
      expect(isStartingDesignKey(key)).toBe(true);
    }
    expect(startingDesignKeys).toContain(neutralStartingDesign);
    expect(isStartingDesignKey('toString')).toBe(false);
    expect(isStartingDesignKey('no-such-design')).toBe(false);
  });

  it('refuses any color that is not #rrggbb, in every color', () => {
    const design = startingDesign('crest');
    for (const color of Object.keys(design.colors) as (keyof typeof design.colors)[]) {
      for (const value of hostileValues) {
        const result = parseDesignDocument({
          ...design,
          colors: { ...design.colors, [color]: value },
        });
        expect(result.ok, `${color}: ${value.slice(0, 40)}`).toBe(false);
      }
    }
  });

  it('refuses a font, a shape word or a version not on its list', () => {
    const design = startingDesign('crest');
    for (const changed of [
      { ...design, fonts: { ...design.fonts, heading: "x'; } body { display:none" } },
      { ...design, fonts: { ...design.fonts, body: 'Comic Sans MS' } },
      { ...design, corners: '0px; } body { display:none' },
      { ...design, cards: 'url(http://example.test)' },
      { ...design, spacing: '</style>' },
      { ...design, base: 'dark; color: red' },
      { ...design, version: 2 },
      { ...design, logo: 'http://example.test/logo.png' },
      'not a design',
      null,
    ]) {
      expect(designDocumentSchema.safeParse(changed).success).toBe(false);
    }
  });

  it('keeps only the values it knows', () => {
    const parsed = parseDesignDocument({ ...startingDesign('crest'), css: '</style>' });
    expect(parsed.ok && 'css' in parsed.design).toBe(false);
  });
});

describe('a starting design with chosen colors', () => {
  it('takes the main, accent and highlight colors given, and the rest of the design', () => {
    const design = startingDesignWith('midnight-gold', {
      primary: '#123456',
      highlight: '#abcdef',
    });
    expect(design).toEqual({
      ...startingDesign('midnight-gold'),
      colors: {
        ...startingDesign('midnight-gold').colors,
        primary: '#123456',
        highlight: '#abcdef',
      },
    });
    expect(startingDesignWith('crest')).toEqual(startingDesign('crest'));
  });

  it('refuses a hostile color and any other value', () => {
    for (const value of hostileValues) {
      expect(() => startingDesignWith('crest', { accent: value })).toThrow();
    }
    expect(() =>
      startingDesignWith('crest', { background: '#000000' } as Record<string, string>),
    ).toThrow();
  });
});
