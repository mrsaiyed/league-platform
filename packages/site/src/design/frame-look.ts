// How the frame of a page is drawn, worked out from a design's own choices
// (docs/build/DESIGN.md, section 3). Three choices decide it, and nothing else:
//
// - its base. A dark design has a header the color of the page and hairlines in the main
//   color (or in the text color, when the main color is too deep to show as a line). A
//   light design has one strong bar of the main color and hairlines in the text color.
// - its corners. Round corners draw the menu as rounded links with the current one filled;
//   square and soft corners draw it as small widely spaced capitals with a line under the
//   current one.
// - its heading face (fonts.ts): how heavy and how far apart titles are set, and whether
//   the hero's title and the league's name are in capitals.
//
// Every value is fixed text that names other variables; nothing a league types is in it.
import { contrastRatio } from './contrast.ts';
import { bandSurfaces, derivedColors, headerSurfaces, mixColors } from './derived-colors.ts';
import type { DesignDocument } from './design-document.ts';
import { headingTraits } from './fonts.ts';

/** A main color needs this much against the page to show as a hairline at low strength. */
const lineContrast = 3;

/**
 * The edge of a control (a field, a picker, an outlined button) and every other strong
 * line: the text color laid on at 45 percent, or as much more as it takes for the line to
 * stand 3 to 1 from the page and from a panel (WCAG 1.4.11). On a dark page 45 is plenty;
 * on a white one a dark text color needs about half. Worked out, so a league's own colors
 * get an edge that can be seen.
 */
const edgeContrast = 3;

/**
 * How much of `ink` (the color of the words there) an edge must be laid on with to stand
 * 3 to 1 from every one of `surfaces`: from `least` percent, in steps of five.
 */
export function shareForEdge(ink: string, surfaces: readonly string[], least: number): number {
  for (let share = least; share < 100; share += 5) {
    const reads = surfaces.every(
      (surface) => contrastRatio(mixColors(surface, ink, share / 100), surface) >= edgeContrast,
    );
    if (reads) return share;
  }
  return 100;
}

export function edgeShare(colors: DesignDocument['colors']): number {
  return shareForEdge(colors.text, [colors.background, colors.panel], 45);
}

/**
 * The same edge where a control stands on a filled ground: in the header (the menu's
 * button, the season picker, the account button) and on a band (the outlined button
 * beside the one that matters). It is the color of the words there, laid on at 40 percent
 * or as much more as it takes: a light design's bar or band of a mid-strength main color
 * needs more than a dark page does.
 */
export function filledEdgeShares(design: DesignDocument): {
  readonly header: number;
  readonly band: number;
} {
  const colors = { ...design.colors, highlight: design.colors.highlight ?? design.colors.accent };
  const derived = derivedColors(colors, design.base);
  const headerText = design.base === 'dark' ? colors.text : derived.onPrimary;
  return {
    header: shareForEdge(headerText, headerSurfaces(colors, design.base), 40),
    band: shareForEdge(derived.onBand, Object.values(bandSurfaces(colors, design.base)), 40),
  };
}

const bases = {
  dark: {
    '--color-tint': 'color-mix(in srgb, var(--color-primary) 9%, transparent)',
    '--header-background': 'var(--color-background)',
    '--header-text': 'var(--color-text)',
    '--header-name': 'var(--color-text)',
    '--header-line': 'var(--color-line)',
    // A card of a dark design has a little of the main color at one corner, never more
    // than the texts are fitted to (hoverTintShare): where the page gets its warmth.
    '--card-wash': 'color-mix(in srgb, var(--color-primary) 9%, var(--color-panel))',
    // The ground of a soft pill on a card (Postponed, Forfeit): the panel with the tint
    // in it, as one solid color. Laid over a card as a see-through tint it stacked on the
    // card's own wash, and under a bright main color the pill's words fell short of 4.5
    // to 1 there (measured, step 2.147 part 3). This is a surface the texts are fitted to.
    '--color-tint-panel': 'color-mix(in srgb, var(--color-primary) 9%, var(--color-panel))',
    // How much of a team's color fills its shield: on a dark panel a third shows as a
    // deep tone of it.
    '--emblem-strength': '30%',
    '--label-tracking': '0.14em',
    '--hero-align': 'center',
    '--overlay-shadow': '0 16px 32px rgba(0, 0, 0, 0.45)',
    '--scroll-shadow': 'rgba(0, 0, 0, 0.5)',
  },
  light: {
    '--color-tint': 'color-mix(in srgb, var(--color-primary) 7%, transparent)',
    '--header-background': 'var(--color-primary)',
    '--header-text': 'var(--color-on-primary)',
    '--header-name': 'var(--color-on-primary)',
    '--header-line': 'transparent',
    // A card of a light design is its panel's color and nothing else: cards and tables
    // are one tint, and a main color laid over white would turn it dusty.
    '--card-wash': 'var(--color-panel)',
    '--color-tint-panel': 'color-mix(in srgb, var(--color-primary) 7%, var(--color-panel))',
    // On a white panel a team's color needs more than half to have the strength it has on
    // a dark one.
    '--emblem-strength': '55%',
    // The first of a row of leaders' cards. In a dark design it is a small band of the
    // main color (the shared pieces' own default, so nothing is said there). In a light
    // one a filled card of the main color would be a second band over the page's closing
    // band: it is the panel with a little of the main color at one corner (no more than
    // every text is fitted to) and an edge of the main color, and a shield on it is drawn
    // as on any panel.
    '--spot-ground': 'var(--color-panel)',
    '--spot-glow': 'color-mix(in srgb, var(--color-primary) 7%, var(--color-panel))',
    '--spot-edge': 'color-mix(in srgb, var(--color-primary) 45%, transparent)',
    '--spot-words': 'var(--color-text)',
    '--spot-muted': 'var(--color-muted)',
    '--spot-pop': 'var(--color-pop)',
    '--spot-shield-share': '55%',
    '--spot-shield-under': 'transparent',
    '--spot-line-share': '74%',
    '--spot-letter': 'var(--color-text)',
    '--spot-letter-edge': 'transparent',
    '--label-tracking': '0.08em',
    '--hero-align': 'start',
    '--overlay-shadow': '0 16px 32px rgba(0, 0, 0, 0.18)',
    '--scroll-shadow': 'rgba(0, 0, 0, 0.14)',
  },
} as const;

const tabs = {
  // Small widely spaced capitals, the current page in the header's eye-catching color with
  // a line under it.
  line: {
    '--tab-case': 'uppercase',
    '--tab-tracking': '0.14em',
    '--tab-size': 'var(--text-12)',
    '--tab-radius': '0px',
    '--tabs-pad': '0px',
    '--tabs-justify': 'center',
    '--tab-text': 'var(--header-muted)',
    '--tab-hover-background': 'transparent',
    '--tab-hover-text': 'var(--header-text)',
    '--tab-current-background': 'transparent',
    '--tab-current-text': 'var(--header-pop)',
    '--tab-current-line': 'var(--header-pop)',
  },
  // Rounded links, the current one filled.
  pill: {
    '--tab-case': 'none',
    '--tab-tracking': '0',
    '--tab-size': 'var(--text-14)',
    '--tab-radius': 'var(--radius-pill)',
    '--tabs-pad': 'var(--step-2)',
    '--tabs-justify': 'flex-start',
    '--tab-text': 'var(--header-text)',
    // The bar moved away from its words (derived-colors.ts), so a hovered tab reads at
    // least as well as a still one, whatever the league's main color.
    '--tab-hover-background': 'var(--color-primary-hover)',
    '--tab-hover-text': 'var(--color-on-primary)',
    '--tab-current-background': 'var(--color-on-primary)',
    '--tab-current-text': 'var(--color-primary)',
    '--tab-current-line': 'transparent',
  },
} as const;

/** The variables of the frame for one design. */
export function frameVariables(design: DesignDocument): Record<string, string> {
  const dark = design.base === 'dark';
  const traits = headingTraits[design.fonts.heading];
  // A dark design draws its hairlines in the main color where that shows on the page
  // (gold on navy); a main color too deep to show (maroon on wine-black) leaves them to
  // the text color, as in a light design.
  const mainShows =
    dark && contrastRatio(design.colors.primary, design.colors.background) >= lineContrast;
  // Rounded links are filled with the bar's own colors, so they belong to a light design's
  // bar; a dark design always has the line.
  const tabStyle = !dark && design.corners === 'round' ? tabs.pill : tabs.line;
  const filled = filledEdgeShares(design);
  return {
    ...bases[design.base],
    // Whole numbers from a fixed list, never anything a league typed.
    '--color-line-strong': `color-mix(in srgb, var(--color-text) ${edgeShare(design.colors)}%, transparent)`,
    '--header-edge': `color-mix(in srgb, var(--header-text) ${filled.header}%, transparent)`,
    '--band-edge': `color-mix(in srgb, var(--color-on-band) ${filled.band}%, transparent)`,
    '--color-line': mainShows
      ? 'color-mix(in srgb, var(--color-primary) 22%, transparent)'
      : 'color-mix(in srgb, var(--color-text) 14%, transparent)',
    ...tabStyle,
    // A dark design whose main color shows keeps the current page in it, as its name is.
    ...(mainShows
      ? {
          '--header-name': 'var(--color-primary-text)',
          '--tab-current-text': 'var(--color-primary-text)',
          '--tab-current-line': 'var(--color-primary)',
        }
      : {}),
    '--heading-weight': traits.weight,
    '--display-weight': traits.displayWeight,
    '--heading-tracking': traits.tracking,
    '--heading-case': traits.titleCase,
    '--hero-case': traits.heroCase,
    '--hero-tracking': traits.heroTracking,
    '--brand-case': traits.brandCase,
    '--brand-tracking': traits.brandTracking,
    '--heading-letter': traits.letterWidth,
  };
}
