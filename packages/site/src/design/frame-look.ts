// How the frame of a page is drawn for a dark design and for a light one
// (docs/build/DESIGN.md, section 3). A dark design has a header the color of the page, the
// league's name in the main color, the menu as uppercase tabs with a line under the current
// one, hairlines in the main color and uppercase headings. A light design has one strong
// bar of the main color, the menu as rounded links with the current one filled, hairlines
// in the text color and headings as written. Every value is fixed text that names other
// variables; nothing a league types is in it.
export const frameVariables = {
  dark: {
    '--color-line': 'color-mix(in srgb, var(--color-primary) 22%, transparent)',
    '--color-line-strong': 'color-mix(in srgb, var(--color-text) 45%, transparent)',
    '--color-tint': 'color-mix(in srgb, var(--color-primary) 9%, transparent)',
    '--header-background': 'var(--color-background)',
    '--header-text': 'var(--color-text)',
    '--header-name': 'var(--color-primary-text)',
    '--header-line': 'var(--color-line)',
    '--tab-case': 'uppercase',
    '--tab-tracking': '0.1em',
    '--tab-radius': '0px',
    '--tabs-pad': '0px',
    '--tab-hover-background': 'transparent',
    '--tab-hover-text': 'var(--color-primary-text)',
    '--tab-current-background': 'transparent',
    '--tab-current-text': 'var(--color-primary-text)',
    '--tab-current-line': 'var(--color-primary)',
    '--heading-case': 'uppercase',
    '--heading-tracking': '0.06em',
    '--label-tracking': '0.14em',
    '--hero-align': 'center',
    '--overlay-shadow': '0 16px 32px rgba(0, 0, 0, 0.45)',
  },
  light: {
    '--color-line': 'color-mix(in srgb, var(--color-text) 14%, transparent)',
    '--color-line-strong': 'color-mix(in srgb, var(--color-text) 45%, transparent)',
    '--color-tint': 'color-mix(in srgb, var(--color-primary) 7%, transparent)',
    '--header-background': 'var(--color-primary)',
    '--header-text': 'var(--color-on-primary)',
    '--header-name': 'var(--color-on-primary)',
    '--header-line': 'transparent',
    '--tab-case': 'none',
    '--tab-tracking': '0',
    '--tab-radius': 'var(--radius-pill)',
    '--tabs-pad': 'var(--step-2)',
    '--tab-hover-background': 'color-mix(in srgb, var(--color-on-primary) 18%, transparent)',
    '--tab-hover-text': 'var(--color-on-primary)',
    '--tab-current-background': 'var(--color-on-primary)',
    '--tab-current-text': 'var(--color-primary)',
    '--tab-current-line': 'transparent',
    '--heading-case': 'none',
    '--heading-tracking': '0',
    '--label-tracking': '0.08em',
    '--hero-align': 'start',
    '--overlay-shadow': '0 16px 32px rgba(0, 0, 0, 0.18)',
  },
} as const;
