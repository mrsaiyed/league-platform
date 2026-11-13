// The message-file loader and lookup (T-187). A missing key is an error, never a blank.
import { en, type MessageKey } from './en.ts';

export type Catalog = Readonly<Record<string, string>>;
export type MessageParams = Readonly<Record<string, string | number>>;

export class MissingMessageError extends Error {
  readonly key: string;
  readonly locale: string;
  constructor(key: string, locale: string) {
    super(`Missing message "${key}" for locale "${locale}"`);
    this.key = key;
    this.locale = locale;
  }
}

export const catalogs: Readonly<Record<string, Catalog>> = { en };

function own(catalog: Catalog, key: string): string | undefined {
  return Object.hasOwn(catalog, key) ? catalog[key] : undefined;
}

/** Keys the base catalog has and the other lacks (and the reverse, as extras). */
export function compareCatalogs(base: Catalog, other: Catalog) {
  return {
    missing: Object.keys(base).filter((k) => !Object.hasOwn(other, k)),
    extra: Object.keys(other).filter((k) => !Object.hasOwn(base, k)),
  };
}

/** "ar_EG" and "AR-eg" become "ar-EG"; anything that is not a language tag becomes "en". */
export function normalizeLocale(locale: string): string {
  try {
    return Intl.getCanonicalLocales(locale.replaceAll('_', '-'))[0] ?? 'en';
  } catch {
    return 'en';
  }
}

type PluralSuffix = '_one' | '_other';
/** Keys with a _one / _other pair; asked for by the name without the suffix. */
export type PluralMessageKey =
  Extract<MessageKey, `${string}_other`> extends `${infer K}_other` ? K : never;

export type Translate = {
  (key: Exclude<MessageKey, `${string}${PluralSuffix}`>, params?: MessageParams): string;
  /** Picks `${key}_one`, `${key}_other` and so on by the locale's plural rule for `count`. */
  plural(key: PluralMessageKey, count: number, params?: MessageParams): string;
};

/** Looks up `locale` (then its language, e.g. "ar" for "ar-EG"). Unknown locales fall back to English. */
export function createTranslator(
  locale: string,
  available: Readonly<Record<string, Catalog>> = catalogs,
): Translate {
  const tag = normalizeLocale(locale);
  const byTag = new Map<string, Catalog>(
    Object.entries(available).map(([k, v]) => [normalizeLocale(k).toLowerCase(), v]),
  );
  const language = tag.split('-')[0] ?? tag;
  const catalog =
    byTag.get(tag.toLowerCase()) ?? byTag.get(language.toLowerCase()) ?? byTag.get('en') ?? en;

  const fill = (key: string, text: string, params?: MessageParams): string => {
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (_whole, name: string) => {
      const value = Object.hasOwn(params, name) ? params[name] : undefined;
      if (value === undefined) throw new MissingMessageError(`${key}:${name}`, tag);
      return String(value);
    });
  };

  const lookup = (key: string, params?: MessageParams): string => {
    const text = own(catalog, key);
    if (text === undefined) throw new MissingMessageError(key, tag);
    return fill(key, text, params);
  };

  const plural = (key: string, count: number, params?: MessageParams): string => {
    let category = 'other';
    try {
      category = new Intl.PluralRules(tag).select(count);
    } catch {
      // keep "other"
    }
    const picked = `${key}_${category}`;
    const text = own(catalog, picked) ?? own(catalog, `${key}_other`);
    if (text === undefined) throw new MissingMessageError(picked, tag);
    return fill(picked, text, { ...params, count });
  };

  return Object.assign((key: string, params?: MessageParams) => lookup(key, params), {
    plural,
  }) as Translate;
}
