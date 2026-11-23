// The message-file loader and lookup (T-187). A missing key is an error, never a blank.
// The lookup itself is translate.ts, which holds no message file: code that runs in the
// browser uses that with the words its page sent, never this file (step 2.38, L9).
import { en } from './en.ts';
import { translatorFrom, type Catalog, type Translate } from './translate.ts';

export const catalogs: Readonly<Record<string, Catalog>> = { en };

/** Keys the base catalog has and the other lacks (and the reverse, as extras). */
export function compareCatalogs(base: Catalog, other: Catalog) {
  return {
    missing: Object.keys(base).filter((k) => !Object.hasOwn(other, k)),
    extra: Object.keys(other).filter((k) => !Object.hasOwn(base, k)),
  };
}

/** Looks up `locale` (then its language, e.g. "ar" for "ar-EG"). Unknown locales fall back to English. */
export function createTranslator(
  locale: string,
  available: Readonly<Record<string, Catalog>> = catalogs,
): Translate {
  return translatorFrom(locale, available, en);
}
