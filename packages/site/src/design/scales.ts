// The one spacing scale and the one type scale every screen is built from
// (docs/build/DESIGN.md, section 4, lines 2 and 5). A design chooses how roomy it is; the
// gaps it gets are still steps of the same scale.

/** 4, 8, 12, 16, 24, 32, 48, 64. */
export const stepVariables = {
  '--step-1': '0.25rem',
  '--step-2': '0.5rem',
  '--step-3': '0.75rem',
  '--step-4': '1rem',
  '--step-5': '1.5rem',
  '--step-6': '2rem',
  '--step-7': '3rem',
  '--step-8': '4rem',
} as const;

/** 12, 14, 16, 18, 22, 28, 36. */
export const textVariables = {
  '--text-12': '0.75rem',
  '--text-14': '0.875rem',
  '--text-16': '1rem',
  '--text-18': '1.125rem',
  '--text-22': '1.375rem',
  '--text-28': '1.75rem',
  '--text-36': '2.25rem',
} as const;

/**
 * The height of anything a thumb taps: 44, on every screen (docs/build/DESIGN.md, section 3).
 * Written once here, so no stylesheet carries the number itself.
 */
export const tapVariables = { '--tap': '2.75rem' } as const;

/**
 * What a design's spacing choice sets: the padding of a card and the gap between cards
 * (`--space`), the gap inside a card (`--space-tight`) and the gap between the sections of a
 * page (`--space-section`).
 */
export const spacingVariables = {
  compact: { '--space': '0.75rem', '--space-tight': '0.5rem', '--space-section': '1.5rem' },
  comfortable: { '--space': '1rem', '--space-tight': '0.5rem', '--space-section': '2rem' },
  roomy: { '--space': '1.5rem', '--space-tight': '0.75rem', '--space-section': '3rem' },
} as const;
