// Turns a design into CSS variables, once per page (T-90). No per-league stylesheet.
// Every value is a hex color, a known font stack or a fixed keyword, so nothing a league
// types can reach the stylesheet text.
import type { DesignDocument } from './design-document.ts';
import { fontStacks } from './fonts.ts';

const radius = { sharp: '0px', soft: '8px', round: '16px' } as const;
const cardBorder = { flat: '0', outlined: '1px', raised: '0' } as const;
const cardShadow = {
  flat: 'none',
  outlined: 'none',
  raised: '0 4px 14px rgba(0, 0, 0, 0.25)',
} as const;
const space = { compact: '0.75rem', comfortable: '1rem', roomy: '1.5rem' } as const;

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
  return {
    '--color-background': color(design.colors.background, 'background'),
    '--color-panel': color(design.colors.panel, 'panel'),
    '--color-text': color(design.colors.text, 'text'),
    '--color-primary': color(design.colors.primary, 'primary'),
    '--color-accent': color(design.colors.accent, 'accent'),
    '--font-heading': known(fontStacks, design.fonts.heading, 'font'),
    '--font-body': known(fontStacks, design.fonts.body, 'font'),
    '--radius': known(radius, design.corners, 'corners'),
    '--card-border-width': known(cardBorder, design.cards, 'cards'),
    '--card-shadow': known(cardShadow, design.cards, 'cards'),
    '--space': known(space, design.spacing, 'spacing'),
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
