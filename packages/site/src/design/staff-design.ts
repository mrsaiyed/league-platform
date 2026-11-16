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
/** The menu must carry pale words with room to spare. */
const menuContrast = 11;

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
  /** The current item, filled, and the words on it. */
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

/** The staff area's own colors for a league whose main color is `main`. */
export function staffColors(design: DesignDocument): StaffColors {
  const staff = staffDesignOf(design);
  const main = staff.colors.primary;
  // A dark shade of the main color; a pale main color (a gold, a sky blue) is deepened
  // further, until pale words read on it with room to spare.
  let menu = mixColors(main, night, menuDepth);
  for (let depth = menuDepth; contrastRatio(menu, '#ffffff') < menuContrast && depth < 1; ) {
    depth = Math.min(1, depth + 0.04);
    menu = mixColors(main, night, depth);
  }
  const menuText = mixColors('#ffffff', menu, 0.12);
  // The current item is filled with the main color, drawn back towards the menu so it sits
  // in it; its words are whichever of the menu's own read on it.
  const menuCurrent = mixColors(main, menu, 0.4);
  const soft = (hue: string, share: number) => mixColors(sheet, hue, share);
  const goodSoft = soft(goodGreen, 0.13);
  const waitSoft = soft(waitAmber, 0.16);
  const dangerRed = designToCssVariables(staff)['--color-danger'] ?? '#b3261e';
  const dangerSoft = soft(dangerRed, 0.08);
  return {
    menu,
    menuText,
    menuMuted: readableOn(mixColors('#ffffff', menu, 0.42), [menu]),
    menuLine: mixColors(menu, '#ffffff', 0.14),
    menuHover: mixColors(menu, '#ffffff', 0.08),
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
  const colors = staffColors(design);
  return {
    ...designToCssVariables(staffDesignOf(design)),
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
