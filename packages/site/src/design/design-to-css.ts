// Turns a design into CSS variables, once per page (T-90). No per-league stylesheet.
// Every value is a hex color, a known font stack or a fixed keyword, so nothing a league
// types can reach the stylesheet text. Beside the values a league chooses it writes the ones
// worked out from them (derived-colors.ts, frame-look.ts) and the two scales every screen
// is built from (scales.ts), so the stylesheets hold no color, size or gap of their own.
import type { DesignDocument } from './design-document.ts';
import { derivedColors } from './derived-colors.ts';
import { fontStacks } from './fonts.ts';
import { frameVariables } from './frame-look.ts';
import { spacingVariables, stepVariables, tapVariables, textVariables } from './scales.ts';

/** The corners of a card, of a button or field, and of a pill. */
const corners = {
  sharp: { '--radius': '0px', '--radius-small': '0px', '--radius-pill': '0px' },
  soft: { '--radius': '8px', '--radius-small': '6px', '--radius-pill': '999px' },
  round: { '--radius': '12px', '--radius-small': '8px', '--radius-pill': '999px' },
} as const;
/** A card is told from the page by nothing, by a hairline, or by a hairline and a soft shadow. */
const cards = {
  flat: { '--card-border-width': '0', '--card-shadow': 'none' },
  outlined: { '--card-border-width': '1px', '--card-shadow': 'none' },
  raised: {
    '--card-border-width': '1px',
    '--card-shadow': '0 1px 2px rgba(0, 0, 0, 0.05), 0 8px 24px rgba(0, 0, 0, 0.07)',
  },
} as const;

const hex = /^#[0-9a-fA-F]{6}$/;

/** A value looked up in a fixed table; anything not a key of the table is refused. */
function known<T extends object>(table: T, key: unknown, what: string): T[keyof T] {
  if (typeof key !== 'string' || !Object.hasOwn(table, key)) {
    throw new Error(`Unknown ${what}`);
  }
  return table[key as keyof T];
}

function color(value: unknown, what: string): string {
  if (typeof value !== 'string' || !hex.test(value))
    throw new Error(`Not a #rrggbb color: ${what}`);
  return value;
}

/** Every value is checked again here, so a design that skipped the schema still cannot inject CSS. */
export function designToCssVariables(design: DesignDocument): Record<string, string> {
  const base = design.base as unknown;
  if (base !== 'light' && base !== 'dark') throw new Error('Unknown color scheme');
  const chosen = {
    background: color(design.colors.background, 'background'),
    panel: color(design.colors.panel, 'panel'),
    text: color(design.colors.text, 'text'),
    primary: color(design.colors.primary, 'primary'),
    accent: color(design.colors.accent, 'accent'),
    highlight: color(design.colors.highlight ?? design.colors.accent, 'highlight'),
  };
  const derived = derivedColors(chosen);
  return {
    '--color-background': chosen.background,
    '--color-panel': chosen.panel,
    '--color-text': chosen.text,
    '--color-primary': chosen.primary,
    '--color-accent': chosen.accent,
    '--color-highlight': chosen.highlight,
    '--color-muted': derived.muted,
    '--color-primary-text': derived.primaryText,
    '--color-accent-text': derived.accentText,
    '--color-on-primary': derived.onPrimary,
    '--color-on-highlight': derived.onHighlight,
    '--color-danger': derived.danger,
    '--color-on-danger': derived.onDanger,
    '--font-heading': known(fontStacks, design.fonts.heading, 'font'),
    '--font-body': known(fontStacks, design.fonts.body, 'font'),
    ...known(corners, design.corners, 'corners'),
    ...known(cards, design.cards, 'cards'),
    ...known(spacingVariables, design.spacing, 'spacing'),
    ...stepVariables,
    ...textVariables,
    ...tapVariables,
    ...frameVariables[base],
    'color-scheme': base,
  };
}

/** The text of one style block for the page head. */
const safeSelector = /^(:root|\[data-[a-z][a-z0-9-]*(="[A-Za-z0-9_-]*")?\]|\.[a-z][a-z0-9-]*)$/;

export function designToCssText(design: DesignDocument, selector = ':root'): string {
  if (!safeSelector.test(selector)) throw new Error(`Unsafe CSS selector: ${selector}`);
  const lines = Object.entries(designToCssVariables(design)).map(([k, v]) => `  ${k}: ${v};`);
  return `${selector} {\n${lines.join('\n')}\n}`;
}
