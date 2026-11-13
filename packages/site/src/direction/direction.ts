// Right-to-left support (T-188). The interface follows the locale; league content can be
// in any script, so text is also checked by its own first letters.
export type Direction = 'ltr' | 'rtl';

const rtlLanguages = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ckb', 'ks']);
const rtlScripts = new Set(['Arab', 'Hebr', 'Thaa', 'Syrc', 'Nkoo', 'Adlm']);

export function directionOf(locale: string): Direction {
  try {
    const l = new Intl.Locale(locale.replaceAll('_', '-')).maximize();
    if (l.script) return rtlScripts.has(l.script) ? 'rtl' : 'ltr';
    return rtlLanguages.has(l.language) ? 'rtl' : 'ltr';
  } catch {
    return 'ltr';
  }
}

/** The attributes for the page's root element. An invalid locale becomes English. */
export function htmlAttributes(locale: string): { lang: string; dir: Direction } {
  let lang = 'en';
  try {
    lang = Intl.getCanonicalLocales(locale.replaceAll('_', '-'))[0] ?? 'en';
  } catch {
    lang = 'en';
  }
  return { lang, dir: directionOf(lang) };
}

// Hebrew, Arabic, Syriac, Thaana, N'Ko, Samaritan, Mandaic and Arabic extended blocks;
// Hebrew and Arabic presentation forms; and the astral right-to-left scripts
// (Phoenician to Old Hungarian, Adlam, Arabic mathematical symbols: 1E800-1EFFF).
const rtlLetter = new RegExp(
  '[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]',
  'u',
);
const anyLetter = /\p{L}/u;

/** Direction of a piece of league content: the first letter decides; no letters means `fallback`. */
export function textDirection(text: string, fallback: Direction = 'ltr'): Direction {
  for (const ch of text) {
    if (anyLetter.test(ch)) return rtlLetter.test(ch) ? 'rtl' : 'ltr';
  }
  return fallback;
}
