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
import type { DesignDocument } from './design-document.ts';
import { headingTraits } from './fonts.ts';

/** A main color needs this much against the page to show as a hairline at low strength. */
const lineContrast = 3;

const bases = {
  dark: {
    '--color-line-strong': 'color-mix(in srgb, var(--color-text) 45%, transparent)',
    '--color-tint': 'color-mix(in srgb, var(--color-primary) 9%, transparent)',
    '--header-background': 'var(--color-background)',
    '--header-text': 'var(--color-text)',
    '--header-name': 'var(--color-text)',
    '--header-line': 'var(--color-line)',
    '--label-tracking': '0.14em',
    '--hero-align': 'center',
    '--overlay-shadow': '0 16px 32px rgba(0, 0, 0, 0.45)',
    '--scroll-shadow': 'rgba(0, 0, 0, 0.5)',
  },
  light: {
    '--color-line-strong': 'color-mix(in srgb, var(--color-text) 45%, transparent)',
    '--color-tint': 'color-mix(in srgb, var(--color-primary) 7%, transparent)',
    '--header-background': 'var(--color-primary)',
    '--header-text': 'var(--color-on-primary)',
    '--header-name': 'var(--color-on-primary)',
    '--header-line': 'transparent',
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
  return {
    ...bases[design.base],
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
