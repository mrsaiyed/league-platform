// The made-up designs kept for pictures and tests, and the three color sets every shared
// piece is proved in (docs/build/DESIGN.md, section 4, line 28): the first starting
// design, its light sibling, and a green league that is neither maroon nor navy. Every
// text color the pieces use must read where it is used (AA, 4.5 to 1), in all three.
import {
  bandSurfaces,
  contrastRatio,
  contrastWarnings,
  derivedColorWarnings,
  derivedColors,
  designToCssVariables,
  headerSurfaces,
  mixColors,
  parseDesignDocument,
  startingDesignKeys,
  textSurfaces,
} from '@srleagues/site';
import { describe, expect, it } from 'vitest';
import { siteOfLeague } from './league-site.ts';
import {
  madeUpDesign,
  madeUpDesignKeys,
  picturedDesign,
  picturedDesignKeys,
} from './stand-in-designs.ts';
import { standInLeagueSites, standInLeagueSitesIn } from './stand-in-league-sites.ts';
import { standInLeagues } from './stand-in-ports.ts';

// Since step 2.147 part 3 the proof is every design a league can be pictured under: the
// four starting designs and the two made-up ones (the green `pine`, and `ember`, whose
// bright orange main color cannot be read as text).
const proof = picturedDesignKeys;

describe('the designs a made-up league can be pictured under', () => {
  it('are every starting design and the made-up ones, each a whole design', () => {
    expect(picturedDesignKeys).toEqual([...startingDesignKeys, ...madeUpDesignKeys]);
    expect(madeUpDesignKeys).toEqual(['pine', 'ember']);
    for (const key of picturedDesignKeys) {
      expect(parseDesignDocument(picturedDesign(key)).ok, key).toBe(true);
    }
  });

  it('keeps a third color set that is neither maroon nor navy: a green league', () => {
    const { colors } = madeUpDesign('pine');
    const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    for (const name of ['background', 'panel', 'primary'] as const) {
      const [red, green, blue] = channels(colors[name]);
      expect(green, name).toBeGreaterThan(red ?? 255);
      expect(green, name).toBeGreaterThan(blue ?? 255);
    }
  });

  it('draws the first made-up league under the first starting design, or the one named', () => {
    expect(siteOfLeague(standInLeagues.live, standInLeagueSites).design).toEqual(
      picturedDesign('crest'),
    );
    for (const key of picturedDesignKeys) {
      const source = standInLeagueSitesIn(key);
      expect(siteOfLeague(standInLeagues.live, source).design, key).toEqual(picturedDesign(key));
      // Only the first league: the other keeps its own look, and its name.
      expect(siteOfLeague(standInLeagues.other, source)).toEqual(
        siteOfLeague(standInLeagues.other, standInLeagueSites),
      );
    }
    expect(siteOfLeague(standInLeagues.other, standInLeagueSites).design).toEqual(
      picturedDesign('clean-court'),
    );
  });
});

describe('contrast in the three color sets the pieces are proved in', () => {
  for (const key of proof) {
    it(`${key}: every text color reads where it is used (AA)`, () => {
      const design = picturedDesign(key);
      // The league's own colors, and every color worked out from them, on every surface
      // each is used on: nothing to warn about.
      expect(contrastWarnings(design)).toEqual([]);
      expect(derivedColorWarnings(design)).toEqual([]);
      // And measured here pair by pair, so the check does not rest on the list above.
      const colors = {
        ...design.colors,
        highlight: design.colors.highlight ?? design.colors.accent,
      };
      const derived = derivedColors(colors, design.base);
      const reads = (text: string, surface: string, what: string) =>
        expect(contrastRatio(text, surface), `${key}: ${what}`).toBeGreaterThanOrEqual(4.5);
      for (const surface of textSurfaces(colors)) {
        reads(colors.text, surface, 'text');
        reads(derived.muted, surface, 'quiet text');
        reads(derived.primaryText, surface, 'a link');
        reads(derived.accentText, surface, 'a small label');
        reads(derived.pop, surface, 'a big number, a score, a way on');
        reads(derived.danger, surface, 'an error');
      }
      for (const surface of [colors.background, colors.panel]) {
        reads(colors.highlight, surface, "the winner's score");
      }
      reads(derived.onHighlight, colors.highlight, 'the Live pill');
      reads(derived.onPrimary, colors.primary, 'the main button');
      for (const surface of Object.values(bandSurfaces(colors, design.base))) {
        reads(derived.onBand, surface, "the hero's title");
        reads(derived.bandMuted, surface, "the hero's sentence");
        reads(derived.bandPop, surface, "the hero's second line");
      }
      reads(derived.onBandPop, derived.bandPop, 'the button that matters');
      reads(derived.onBandPop, derived.bandPopHover, 'the button that matters, hovered');
      for (const surface of headerSurfaces(colors, design.base)) {
        reads(derived.headerMuted, surface, 'the menu');
        reads(derived.headerPop, surface, 'the current page');
        // The league's name and the words of the header's first row.
        reads(design.base === 'dark' ? colors.text : derived.onPrimary, surface, 'the name');
      }
      // The parts of controls (3 to 1, WCAG 1.4.11): the edge of a field, a picker or an
      // outlined button is the text color laid on the page or a panel at the strength
      // the design's frame gives it, and must stand out from what it is drawn on.
      const strong = /var\(--color-text\) (\d+)%/.exec(
        designToCssVariables(design)['--color-line-strong'] ?? '',
      );
      expect(strong, `${key}: a control's edge`).not.toBeNull();
      const share = Number(strong?.[1] ?? 0) / 100;
      for (const surface of [colors.background, colors.panel]) {
        const edge = mixColors(surface, colors.text, share);
        expect(contrastRatio(edge, surface), `${key}: a control's edge`).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it('gives the eye the highlight where a bright main color cannot be read: the orange league', () => {
    const design = madeUpDesign('ember');
    const colors = { ...design.colors, highlight: design.colors.highlight ?? design.colors.accent };
    const derived = derivedColors(colors, design.base);
    // The orange reads neither as text on the page nor under white words...
    expect(contrastRatio(colors.primary, colors.background)).toBeLessThan(3);
    expect(contrastRatio('#ffffff', colors.primary)).toBeLessThan(3);
    // ...so the eye lands on the highlight as the league gave it, the bar's words are the
    // dark text color, and a band is a dark ground the orange itself shines on.
    expect(derived.pop).toBe(colors.highlight);
    expect(derived.onPrimary).toBe(colors.text);
    expect(contrastRatio(derived.band, colors.text)).toBeLessThan(2);
    expect(derived.bandPop).toBe(colors.primary);
  });

  it('reaches the page as variables, the same for a made-up design as for a starting one', () => {
    for (const key of proof) {
      const vars = designToCssVariables(picturedDesign(key));
      for (const name of [
        '--color-pop',
        '--color-band',
        '--color-band-deep',
        '--color-on-band',
        '--color-band-muted',
        '--color-band-pop',
        '--color-on-band-pop',
        '--header-muted',
        '--header-pop',
      ]) {
        expect(vars[name], `${key} ${name}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});
