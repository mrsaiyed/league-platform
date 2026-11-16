// The staff area's colors hold for ANY league's colors (step 2.103; docs/build/DESIGN.md
// section 4, lines 20, 22 and 23). A league's admin picks a main color, an accent and a
// highlight; black is a common main color and so is a bright yellow. So the rules of
// staff-design.ts are proved over a sweep of many of each, not over a handful of examples:
//
// - the menu is a dark ground that carries pale words;
// - the menu's current item stands at least 3 to 1 from the menu (and from an item under
//   the pointer by more than the pointer's own tint), so "the current one filled" is true
//   for a black league as for a maroon one;
// - every word of the menu reaches 4.5 to 1 where it is written: plain and quiet words
//   and the "Not ready" mark on the menu and under the pointer, and everything on the
//   current item (which is all in one color there: staff.css);
// - the soft grounds of "done", "waiting" and "refused" hold their words at 4.5 to 1;
// - the workspace's own words, its filled main button and its links read as well.
//
// If a color set fails here, the rule in staff-design.ts is what is wrong, not this test.
import { beforeAll, describe, expect, it } from 'vitest';
import {
  contrastRatio,
  staffColors,
  staffCssVariables,
  startingDesign,
  startingDesignKeys,
  type DesignDocument,
  type StaffColors,
} from '../../index.ts';

/** A color of the wheel: hue in degrees, saturation and lightness from 0 to 1. */
function hsl(hue: number, saturation: number, lightness: number): string {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const part = (n: number) => {
    const k = (n + hue / 30) % 12;
    const value = lightness - (chroma / 2) * Math.max(-1, Math.min(k - 3, 9 - k, 1)) * 2;
    return Math.round(Math.max(0, Math.min(1, value)) * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${part(0)}${part(8)}${part(4)}`;
}

/** Twelve hues, each deep, mid, bright and pale; the greys from black to white; and the
    colors leagues really pick. */
const hues = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
const mains = [
  ...hues.flatMap((hue) => [
    hsl(hue, 0.9, 0.12),
    hsl(hue, 0.85, 0.3),
    hsl(hue, 0.9, 0.5),
    hsl(hue, 0.8, 0.72),
    hsl(hue, 0.6, 0.9),
  ]),
  ...['#000000', '#0a0a0a', '#1a1a1a', '#333333', '#666666', '#808080', '#999999'],
  ...['#bbbbbb', '#dddddd', '#f2f2f2', '#ffffff'],
  ...['#96062d', '#0b1f3a', '#1f5fbf', '#1e7f5c', '#c8a84b', '#ffd400', '#ff6a00', '#7ed957'],
];
const accents = ['#b77d8c', '#1f8a8a', '#ffffff', '#000000', '#ffd400', '#3b6fd4'];
const highlights = ['#d3b780', '#e63946', '#00c2a8', '#111111', '#fafafa', undefined];

const base = startingDesign('crest');
const sweep: readonly DesignDocument[] = [
  ...startingDesignKeys.map((key) => startingDesign(key)),
  ...mains.flatMap((primary) =>
    accents.flatMap((accent) =>
      highlights.map((highlight) => {
        const colors = { ...base.colors, primary, accent };
        return {
          ...base,
          colors: highlight === undefined ? colors : { ...colors, highlight },
        };
      }),
    ),
  ),
];

const named = (design: DesignDocument) =>
  `main ${design.colors.primary}, accent ${design.colors.accent}, highlight ${design.colors.highlight ?? 'none'}`;

/** What the staff area is drawn with under one color set: its own colors and its design's. */
type Drawn = {
  readonly design: DesignDocument;
  readonly c: StaffColors;
  readonly of: (name: string) => string;
};
// Worked out once for the whole sweep, as a staff page works it out: every variable.
let drawn: readonly Drawn[] = [];
beforeAll(() => {
  drawn = sweep.map((design) => {
    const v = staffCssVariables(design);
    const of = (name: string) => v[name] ?? '';
    const c: StaffColors = {
      menu: of('--staff-menu'),
      menuText: of('--staff-menu-text'),
      menuMuted: of('--staff-menu-muted'),
      menuLine: of('--staff-menu-line'),
      menuHover: of('--staff-menu-hover'),
      menuCurrent: of('--staff-menu-current'),
      onMenuCurrent: of('--staff-on-menu-current'),
      good: of('--staff-good'),
      goodSoft: of('--staff-good-soft'),
      wait: of('--staff-wait'),
      waitSoft: of('--staff-wait-soft'),
      dangerSoft: of('--staff-danger-soft'),
    };
    return { design, c, of };
  });
});

/** Every color set that breaks `rule`, as sentences; an empty list when none does. */
function broken(rule: (drawn: Drawn) => readonly (readonly [string, number, number])[]) {
  const found: string[] = [];
  for (const one of drawn) {
    const { design } = one;
    for (const [what, ratio, atLeast] of rule(one)) {
      if (ratio < atLeast) {
        found.push(`${named(design)}: ${what} is ${ratio.toFixed(2)} to 1, under ${atLeast}`);
      }
    }
  }
  return found;
}

describe('the staff area’s colors, for any league’s colors', () => {
  it('sweeps many color sets, the black and the pale ones among them', () => {
    expect(drawn.length).toBe(sweep.length);
    expect(sweep.length).toBeGreaterThan(2000);
    expect(mains).toContain('#0a0a0a');
    expect(mains).toContain('#ffd400');
  });

  it('keeps the menu a dark ground that carries pale words', () => {
    expect(
      broken(({ c }) => {
        return [
          ['the menu against white', contrastRatio(c.menu, '#ffffff'), 15],
          ['the menu’s words on the menu', contrastRatio(c.menuText, c.menu), 7],
          ['the menu’s words under the pointer', contrastRatio(c.menuText, c.menuHover), 7],
          ['quiet words on the menu', contrastRatio(c.menuMuted, c.menu), 4.5],
          ['quiet words under the pointer', contrastRatio(c.menuMuted, c.menuHover), 4.5],
        ];
      }),
    ).toEqual([]);
  });

  it('fills the current item so it can be told from the menu, whatever the main color', () => {
    expect(
      broken(({ c }) => {
        return [
          ['the current item against the menu', contrastRatio(c.menuCurrent, c.menu), 3],
          // An item under the pointer is never mistaken for the current one.
          ['the current item against the pointer’s', contrastRatio(c.menuCurrent, c.menuHover), 2],
          // Its name, its icon and a "Not ready" mark are all in this one color.
          ['words on the current item', contrastRatio(c.onMenuCurrent, c.menuCurrent), 4.5],
        ];
      }),
    ).toEqual([]);
  });

  it('keeps the current item a tone of the league’s own main color where one can be seen', () => {
    // The league's maroon stays a maroon, lighter; only a color with no hue becomes a grey.
    const maroon = staffColors(base).menuCurrent;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(maroon.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan((g ?? 0) + 60);
    expect(r).toBeGreaterThan((b ?? 0) + 40);
  });

  it('holds the words of “done”, “waiting” and “refused” on their soft grounds', () => {
    expect(
      broken(({ c, of }) => {
        const danger = of('--color-danger');
        return [
          ['“done” on its ground', contrastRatio(c.good, c.goodSoft), 4.5],
          ['“done” on a panel', contrastRatio(c.good, '#ffffff'), 4.5],
          ['“waiting” on its ground', contrastRatio(c.wait, c.waitSoft), 4.5],
          ['“waiting” on a panel', contrastRatio(c.wait, '#ffffff'), 4.5],
          ['“refused” on its ground', contrastRatio(danger, c.dangerSoft), 4.5],
          ['“refused” on a panel', contrastRatio(danger, '#ffffff'), 4.5],
        ];
      }),
    ).toEqual([]);
  });

  it('keeps the workspace’s own words, links and main button readable', () => {
    expect(
      broken(({ of }) => {
        const page = of('--color-background');
        const panel = of('--color-panel');
        return [
          ['words on the page', contrastRatio(of('--color-text'), page), 10],
          ['words on a panel', contrastRatio(of('--color-text'), panel), 10],
          ['quiet words on the page', contrastRatio(of('--color-muted'), page), 4.5],
          ['quiet words on a panel', contrastRatio(of('--color-muted'), panel), 4.5],
          ['a link on the page', contrastRatio(of('--color-primary-text'), page), 4.5],
          ['a link on a panel', contrastRatio(of('--color-primary-text'), panel), 4.5],
          [
            'words on the main button',
            contrastRatio(of('--color-on-primary'), of('--color-primary')),
            4.5,
          ],
          [
            'words on the main button under the pointer',
            contrastRatio(of('--color-on-primary'), of('--color-primary-hover')),
            4.5,
          ],
          ['a winner’s score on a panel', contrastRatio(of('--color-pop'), panel), 4.5],
        ];
      }),
    ).toEqual([]);
  });
});
