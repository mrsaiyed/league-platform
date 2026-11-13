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

export function designToCssVariables(design: DesignDocument): Record<string, string> {
  return {
    '--color-background': design.colors.background,
    '--color-panel': design.colors.panel,
    '--color-text': design.colors.text,
    '--color-primary': design.colors.primary,
    '--color-accent': design.colors.accent,
    '--font-heading': fontStacks[design.fonts.heading],
    '--font-body': fontStacks[design.fonts.body],
    '--radius': radius[design.corners],
    '--card-border-width': cardBorder[design.cards],
    '--card-shadow': cardShadow[design.cards],
    '--space': space[design.spacing],
    'color-scheme': design.base,
  };
}

/** The text of one style block for the page head. */
const safeSelector = /^(:root|\[data-[a-z][a-z0-9-]*(="[A-Za-z0-9_-]*")?\]|\.[a-z][a-z0-9-]*)$/;

export function designToCssText(design: DesignDocument, selector = ':root'): string {
  if (!safeSelector.test(selector)) throw new Error(`Unsafe CSS selector: ${selector}`);
  const lines = Object.entries(designToCssVariables(design)).map(([k, v]) => `  ${k}: ${v};`);
  return `${selector} {\n${lines.join('\n')}\n}`;
}
