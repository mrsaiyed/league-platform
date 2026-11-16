// The staff area's look, worked out from a league's design (step 2.103; docs/build/DESIGN.md
// section 3 point 9 and section 4 lines 20 to 23). The admin does not wear the league's
// public design: it is a calm, light workspace under any league's colors, with the league's
// main color only on the menu, the main button and the current item. So the staff area
// has a design document of its own, made here from the league's: a pale paper page and
// white panels with a breath of the main color in them, the league's main color, accent
// and highlight as they are, the league's reading face for every title, soft corners and
// outlined cards. Everything the shared pieces need (text that reads, the danger color,
// the color the eye lands on) is then worked out from it exactly as for a public page.
//
// Beside that document the staff area has a few colors no public page has: the side menu,
// in a dark shade of the league's main color, and the soft colors of a state's pill. Each
// is a plain #rrggbb value worked out here, so the admin's stylesheet holds no color.
import { contrastRatio } from './contrast.ts';
import { mixColors, readableOn, textOn } from './derived-colors.ts';
import type { DesignDocument } from './design-document.ts';
import { designToCssVariables } from './design-to-css.ts';
import { fontStacks } from './fonts.ts';

/** The workspace before a league's main color is breathed into it: paper, a sheet, ink. */
const paper = '#f6f4f1';
const sheet = '#ffffff';
const ink = '#201c1e';
/** What a main color is deepened with to make the side menu. */
const night = '#14121a';
/** The hues of a state's pill, before they are fitted to the workspace. */
const goodGreen = '#2e7d52';
const waitAmber = '#b7791f';

/** How much of the main color the page and the words carry: enough to belong to the league. */
const paperTint = 0.012;
const inkTint = 0.1;
/** How far the main color is deepened for the side menu, and how much deeper where it must be. */
const menuDepth = 0.8;
/**
 * The menu must carry pale words with room to spare, and be deep enough that a filled
 * item can stand out from it and still carry white words: 15 to 1 against white leaves a
 * band of tones that do both (see `currentFill`).
 */
const menuContrast = 15;
/** The current item stands this far from the menu (DESIGN.md line 20: "the current one filled"). */
const currentStandsOut = 3;
/** Words on a filled item, and every other word of the menu, read at least this well. */
const wordsRead = 4.5;

/**
 * The fill of the menu's current item: the league's main color, brought to a tone that
 * stands at least 3 to 1 from the menu and carries white words at 4.5 to 1. A main color
 * too dark to stand out (a black, a navy, a deep wine) is lightened towards white only as
 * far as it must be; one too pale to carry white words (a yellow, a sky blue) is deepened
 * towards the menu only as far as it must be. So a black league's current item is a grey
 * that can be seen, and a yellow league's is a deep gold, not a patch of bright yellow.
 */
function currentFill(main: string, menu: string): string {
  const fits = (fill: string) =>
    contrastRatio(fill, menu) >= currentStandsOut && contrastRatio('#ffffff', fill) >= wordsRead;
  const towards = contrastRatio('#ffffff', main) < wordsRead ? menu : '#ffffff';
  for (let step = 0; step <= 200; step++) {
    const fill = mixColors(main, towards, step / 200);
    if (fits(fill)) return fill;
  }
  // No tone of the main color does both (it cannot happen while the menu is as deep as
  // `menuContrast` makes it): a plain grey between the menu and white that does.
  for (let step = 0; step <= 200; step++) {
    const fill = mixColors(menu, '#ffffff', step / 200);
    if (fits(fill)) return fill;
  }
  return mixColors(menu, '#ffffff', 0.4);
}

/** The design document the staff area is drawn with, for a league whose design is `design`. */
export function staffDesignOf(design: DesignDocument): DesignDocument {
  const main = design.colors.primary;
  return {
    version: 1,
    base: 'light',
    colors: {
      background: mixColors(paper, main, paperTint),
      panel: sheet,
      text: mixColors(ink, main, inkTint),
      primary: main,
      accent: design.colors.accent,
      highlight: design.colors.highlight ?? design.colors.accent,
    },
    // Titles in the league's reading face: a workspace is read, not announced.
    fonts: { heading: design.fonts.body, body: design.fonts.body },
    corners: 'soft',
    cards: 'outlined',
    spacing: 'comfortable',
  };
}

export type StaffColors = {
  /** The side menu and the phone's top row: a dark shade of the league's main color. */
  readonly menu: string;
  readonly menuText: string;
  /** Quiet words and icons on the menu. */
  readonly menuMuted: string;
  /** A fine line on the menu, and an item under the pointer. */
  readonly menuLine: string;
  readonly menuHover: string;
  /**
   * The current item, filled with a tone of the main color that stands 3 to 1 from the
   * menu, and the one color of everything written on it (name, icon, "Not ready" mark).
   */
  readonly menuCurrent: string;
  readonly onMenuCurrent: string;
  /** A state's pill: its words and its soft ground, for "done" and for "waiting". */
  readonly good: string;
  readonly goodSoft: string;
  readonly wait: string;
  readonly waitSoft: string;
  /** The soft ground of a refusal, under words in the danger color. */
  readonly dangerSoft: string;
};

/** The staff area's own colors for a league whose design is `design`. */
export function staffColors(design: DesignDocument): StaffColors {
  const staff = staffDesignOf(design);
  return colorsOf(staff.colors.primary, dangerOf(designToCssVariables(staff)));
}

/** The workspace's danger color, among its design's variables. */
const dangerOf = (variables: Readonly<Record<string, string>>): string =>
  variables['--color-danger'] ?? '#b3261e';

/** The staff area's own colors, from the main color and the workspace's danger color. */
function colorsOf(main: string, dangerRed: string): StaffColors {
  // A dark shade of the main color; a pale main color (a gold, a sky blue) is deepened
  // further, until pale words read on it with room to spare.
  let menu = mixColors(main, night, menuDepth);
  for (let depth = menuDepth; contrastRatio(menu, '#ffffff') < menuContrast && depth < 1; ) {
    depth = Math.min(1, depth + 0.04);
    menu = mixColors(main, night, depth);
  }
  const menuText = mixColors('#ffffff', menu, 0.12);
  const menuHover = mixColors(menu, '#ffffff', 0.08);
  // The current item is filled with a tone of the main color that can be told from the
  // menu by anyone (3 to 1); everything written on it (its name, its icon, a "Not ready"
  // mark) is in one color that reads on it.
  const menuCurrent = currentFill(main, menu);
  const soft = (hue: string, share: number) => mixColors(sheet, hue, share);
  const goodSoft = soft(goodGreen, 0.13);
  const waitSoft = soft(waitAmber, 0.16);
  const dangerSoft = soft(dangerRed, 0.08);
  return {
    menu,
    menuText,
    // Quiet words read on the menu and on an item under the pointer.
    menuMuted: readableOn(mixColors('#ffffff', menu, 0.42), [menu, menuHover]),
    menuLine: mixColors(menu, '#ffffff', 0.14),
    menuHover,
    menuCurrent,
    onMenuCurrent: textOn(menuCurrent, ['#ffffff', menuText]),
    good: readableOn(goodGreen, [goodSoft, sheet]),
    goodSoft,
    wait: readableOn(waitAmber, [waitSoft, sheet]),
    waitSoft,
    dangerSoft,
  };
}

/** Every variable the staff area is drawn with: its design's, then its own. */
export function staffCssVariables(design: DesignDocument): Record<string, string> {
  const staff = staffDesignOf(design);
  const variables = designToCssVariables(staff);
  const colors = colorsOf(staff.colors.primary, dangerOf(variables));
  return {
    ...variables,
    '--staff-menu': colors.menu,
    '--staff-menu-text': colors.menuText,
    '--staff-menu-muted': colors.menuMuted,
    '--staff-menu-line': colors.menuLine,
    '--staff-menu-hover': colors.menuHover,
    '--staff-menu-current': colors.menuCurrent,
    '--staff-on-menu-current': colors.onMenuCurrent,
    '--staff-good': colors.good,
    '--staff-good-soft': colors.goodSoft,
    '--staff-wait': colors.wait,
    '--staff-wait-soft': colors.waitSoft,
    '--staff-danger-soft': colors.dangerSoft,
    // The league's own name, in the menu, keeps the league's own title face.
    '--staff-brand-font': fontStacks[design.fonts.heading],
  };
}

/** The text of the one style block of a staff page (T-90): no stylesheet per league. */
export function staffCssText(design: DesignDocument): string {
  const lines = Object.entries(staffCssVariables(design)).map(([k, v]) => `  ${k}: ${v};`);
  return `:root {\n${lines.join('\n')}\n}`;
}
