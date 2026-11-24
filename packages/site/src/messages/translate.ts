// The lookup of interface text (T-187), with no message file of its own: it uses only the
// catalogs handed to it. A page's code that runs in the browser (the tracker's, step 2.38,
// finding L9) asks for a translator here with the words the page sent it, so the site's
// whole message catalog is never part of that code's download. `createTranslator`
// (messages.ts) is the same lookup over every language's message file, for the server.
import type { MessageKey } from './en.ts';

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

function own(catalog: Catalog, key: string): string | undefined {
  return Object.hasOwn(catalog, key) ? catalog[key] : undefined;
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

/**
 * Looks up `locale` (then its language, e.g. "ar" for "ar-EG") in `available`, then its
 * English, then `fallback`. A key the chosen catalog lacks is an error, never a blank.
 */
export function translatorFrom(
  locale: string,
  available: Readonly<Record<string, Catalog>>,
  fallback: Catalog = {},
): Translate {
  const tag = normalizeLocale(locale);
  const byTag = new Map<string, Catalog>(
    Object.entries(available).map(([k, v]) => [normalizeLocale(k).toLowerCase(), v]),
  );
  const language = tag.split('-')[0] ?? tag;
  const catalog =
    byTag.get(tag.toLowerCase()) ??
    byTag.get(language.toLowerCase()) ??
    byTag.get('en') ??
    fallback;

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

  // The language's plural rule, made once and only when first asked for: making one for
  // every count is slow enough to be felt where a screen words many counts at each tap
  // (the scoring screen, finding M6 of the 2.107 audit). Null where the language has none.
  let rules: Intl.PluralRules | null | undefined;
  const pluralRules = (): Intl.PluralRules | null => {
    if (rules === undefined) {
      try {
        rules = new Intl.PluralRules(tag);
      } catch {
        rules = null;
      }
    }
    return rules;
  };

  const plural = (key: string, count: number, params?: MessageParams): string => {
    let category = 'other';
    try {
      category = pluralRules()?.select(count) ?? 'other';
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
