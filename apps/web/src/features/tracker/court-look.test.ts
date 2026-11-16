// The courtside look held to what it promises (docs/build/DESIGN.md section 7; record
// 064): its own `--court-…` values and none of a league's, no downloaded font, no shadow,
// gradient or picture, logical properties only, and the contrast of lines 2 and 3: 7 to 1
// for the score, the clock, a player's number and the saved banner; 4.5 to 1 for the rest.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./court.css', import.meta.url), 'utf8');
/** The stylesheet without its comments. */
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every `--court-…: #rrggbb` the stylesheet sets. */
const colors = new Map(
  [...rules.matchAll(/(--court-[a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/g)].map((m) => [
    m[1] ?? '',
    m[2] ?? '',
  ]),
);

const color = (name: string): string => {
  const value = colors.get(`--court-${name}`);
  if (value === undefined) throw new Error(`court.css sets no --court-${name}`);
  return value;
};

/** Relative luminance (WCAG 2). */
function luminance(hex: string): number {
  const channel = (at: number) => {
    const v = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** The contrast of two of the look's colors, by name. */
function contrast(text: string, ground: string): number {
  const [hi, lo] = [luminance(color(text)), luminance(color(ground))].sort((a, b) => b - a);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/** What is read at arm's length, between plays: each on the ground it sits on. */
const glance: readonly (readonly [what: string, text: string, ground: string])[] = [
  ['the clock', 'gold', 'page'],
  ['the clock at 0:00 (step 2.36)', 'red-text', 'page'],
  ['the time typed in the clock’s form (step 2.36)', 'gold', 'page'],
  ['the score and a number of the team drawn light', 'light-ink', 'light'],
  ['a bench number of the team drawn light', 'light-ink', 'light-bench'],
  ['the score and a number of the team drawn dark', 'text', 'tile'],
  ['a bench number of the team drawn dark', 'text', 'page'],
  ['the saved banner, all saved', 'text', 'page'],
  ['the saved banner, plays waiting', 'amber-ink', 'amber'],
  ['the saved banner, plays not saved', 'text', 'red'],
  // A tile's mark, read at a glance: taken (hollow), then stored in its color.
  ['a tap taken, on the tile', 'text', 'page'],
  ['a basket stored, on the tile', 'text', 'green-deep'],
  ['a foul stored, on the tile', 'text', 'red'],
  ['a turnover or a substitution stored, on the tile', 'gold-ink', 'gold'],
];

/** Everything else that is read. */
const rest: readonly (readonly [what: string, text: string, ground: string])[] = [
  ['words on the page', 'text', 'page'],
  ['words on a panel', 'text', 'panel'],
  ['second-rank words on the page', 'muted', 'page'],
  ['second-rank words on a panel', 'muted', 'panel'],
  ['second-rank words on a tile', 'muted', 'tile'],
  ['a label on the page', 'gold', 'page'],
  ['a label on a panel', 'gold', 'panel'],
  ['a label on a tile', 'gold', 'tile'],
  ['a point button', 'text', 'green'],
  ['points on a dark tile', 'green-text', 'tile'],
  ['the Foul button', 'text', 'red'],
  ['fouls on a dark tile', 'red-text', 'tile'],
  ['fouls on a dark bench tile', 'red-text', 'page'],
  ['−Foul and a take-back, on a panel', 'red-text', 'panel'],
  ['a timeout button (step 2.36)', 'text', 'blue'],
  ['timeouts on a panel (step 2.36)', 'blue-text', 'panel'],
  ['Start and the Start clock button (step 2.36)', 'text', 'green'],
  ['Pause (step 2.36)', 'text', 'red'],
  ['Start greyed at 0:00, "Period over" (step 2.36)', 'muted', 'tile'],
  ['a dark team’s fouls at the bonus, in its box (step 2.36)', 'red-text', 'tile'],
  ['a light team’s fouls at the bonus, in its box (step 2.36)', 'light-red', 'light'],
  ['the double bonus badge (step 2.36)', 'text', 'red'],
  ['"none left" on a timeout button (step 2.36)', 'red-text', 'panel'],
  ['a name on a light tile', 'light-muted', 'light'],
  ['a name on a light bench tile', 'light-muted', 'light-bench'],
  ['fouls on a light tile', 'light-red', 'light'],
  ['fouls on a light bench tile', 'light-red', 'light-bench'],
  ['points on a light tile', 'light-green', 'light'],
  ['the main button', 'gold-ink', 'gold'],
];

/** Edges and rings that carry a meaning: 3 to 1 against what is beside them (WCAG 1.4.11). */
const edges: readonly (readonly [what: string, edge: string, ground: string])[] = [
  ['the focus ring on the page', 'focus', 'page'],
  ['the focus ring on a panel', 'focus', 'panel'],
  ['the ring of an open tile, on a panel', 'gold', 'panel'],
  ['the dark team’s edge, on a panel', 'dark-edge', 'panel'],
  ['the dark team’s edge, on the page', 'dark-edge', 'page'],
  ['the light team’s edge, on a panel', 'light', 'panel'],
  ['a fouled-out edge on a dark tile', 'red-text', 'tile'],
  ['a fouled-out edge on a light tile', 'light-red', 'light'],
];

describe('the courtside look: contrast', () => {
  it.each(glance)('%s is at least 7 to 1', (_what, text, ground) => {
    expect(contrast(text, ground)).toBeGreaterThanOrEqual(7);
  });

  it.each(rest)('%s is at least 4.5 to 1', (_what, text, ground) => {
    expect(contrast(text, ground)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(edges)('%s is at least 3 to 1', (_what, edge, ground) => {
    expect(contrast(edge, ground)).toBeGreaterThanOrEqual(3);
  });

  it('tells the two teams apart by light and dark, not by a hue', () => {
    expect(contrast('light', 'tile')).toBeGreaterThanOrEqual(7);
    expect(contrast('light-bench', 'page')).toBeGreaterThanOrEqual(7);
  });
});

describe('the courtside look: its own values, and nothing else', () => {
  it('reads only its own variables, never a league’s design values', () => {
    const read = [...rules.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1] ?? '');
    expect(read.length).toBeGreaterThan(50);
    expect(read.filter((name) => !name.startsWith('--court-'))).toEqual([]);
    const set = [...rules.matchAll(/(?<![a-z0-9-])(--[a-z0-9-]+)\s*:/g)].map((m) => m[1] ?? '');
    expect(set.filter((name) => !name.startsWith('--court-'))).toEqual([]);
  });

  it('sets every variable it reads', () => {
    const set = new Set([...rules.matchAll(/(--court-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const read = new Set([...rules.matchAll(/var\((--court-[a-z0-9-]+)/g)].map((m) => m[1]));
    expect([...read].filter((name) => !set.has(name))).toEqual([]);
  });

  it('downloads nothing and draws no shadow, gradient or picture', () => {
    for (const banned of [
      '@font-face',
      '@import',
      'url(',
      'gradient(',
      'box-shadow',
      'text-shadow',
    ]) {
      expect(rules.includes(banned), banned).toBe(false);
    }
    // One plain sans face the device already has; no serif.
    expect(/font-family:[^;]*system-ui[^;]*sans-serif\s*;/.test(rules)).toBe(true);
    expect(/font-family:[^;]*(?<!sans-)serif/.test(rules)).toBe(false);
    expect(rules.includes('tabular-nums')).toBe(true);
  });

  it('uses logical properties only, so a right-to-left page mirrors (T-188)', () => {
    const physical = [
      /(?:^|[\s;{])(?:margin|padding|border)-(?:left|right|top|bottom)(?:-[a-z]+)*\s*:/,
      /(?:^|[\s;{])(?:left|right|top|bottom)\s*:/,
      /(?:^|[\s;{])(?:min-|max-)?(?:width|height)\s*:/,
      /text-align:\s*(?:left|right)/,
      /float:\s*(?:left|right)/,
    ];
    const declarations = rules.replace(/@media[^{]*\{/g, '{');
    for (const pattern of physical) expect(pattern.test(declarations), String(pattern)).toBe(false);
  });

  it('is calm under the hand: nothing selected by a long press, no zoom on a double tap', () => {
    expect(rules.includes('user-select: none')).toBe(true);
    expect(rules.includes('-webkit-touch-callout: none')).toBe(true);
    expect(rules.includes('touch-action: manipulation')).toBe(true);
    // Movement only for people who have not asked their device for less.
    const motion = rules.slice(rules.indexOf('@media (prefers-reduced-motion: no-preference)'));
    const outside = rules.slice(0, rules.indexOf('@media (prefers-reduced-motion: no-preference)'));
    expect(motion.includes('animation:')).toBe(true);
    expect(/(?:^|[\s;{])(?:animation|transition)\s*:/.test(outside)).toBe(false);
  });
});
