// What the internal tool that makes a league (P3 §8, step 2.125) is asked, checked
// before anything is made: the questions of P3 §1 step 2 (name, short name, sport,
// who plays, where), the contact email, the owner's email, and the first season's
// name (step 4, suggested from today's date). Pure: it reads nothing and makes
// nothing. The commands check everything again when they run.
import { z } from 'zod';
import { isBlockedShortName, shortNameSchema } from '../short-names.ts';
import {
  listedByDefault,
  offeredSports,
  type Audience,
  type OfferedSport,
} from '../league-values.ts';

/** "Who plays?" (P3 §1 step 2): adults, under-18s, or both. */
export const whoPlaysChoices = {
  adults: 'adult',
  'under-18s': 'youth',
  both: 'mixed',
} as const satisfies Record<string, Audience>;
export type WhoPlays = keyof typeof whoPlaysChoices;

/** The parts of the year a season is named after (P3 §1 step 4: "Fall 2026"). */
export const seasonParts = ['winter', 'spring', 'summer', 'fall'] as const;
export type SeasonPart = (typeof seasonParts)[number];

/** What the tool was given, as typed. Anything may be missing. */
export type NewLeagueAnswers = {
  readonly name?: string | undefined;
  readonly shortName?: string | undefined;
  readonly sport?: string | undefined;
  readonly whoPlays?: string | undefined;
  readonly city?: string | undefined;
  readonly timeZone?: string | undefined;
  readonly contactEmail?: string | undefined;
  readonly ownerEmail?: string | undefined;
  readonly seasonName?: string | undefined;
};

export const newLeagueFields = [
  'name',
  'shortName',
  'sport',
  'whoPlays',
  'city',
  'timeZone',
  'contactEmail',
  'ownerEmail',
  'seasonName',
] as const;
export type NewLeagueField = (typeof newLeagueFields)[number];

/** Why one answer cannot be used. */
export type NewLeagueProblem = {
  readonly field: NewLeagueField;
  readonly problem: 'missing' | 'invalid' | 'blocked';
};

/** A league ready to make, with its first season. */
export type NewLeaguePlan = {
  readonly name: string;
  readonly slug: string;
  readonly sportKey: OfferedSport;
  readonly audience: Audience;
  /** U-10: listed in /find by default for adult leagues only. */
  readonly listed: boolean;
  readonly city: string;
  readonly timeZone: string;
  readonly contactEmail: string;
  /** Written as given, spaces dropped; accounts are matched whatever its capitals. */
  readonly ownerEmail: string;
  readonly season: { readonly name: string; readonly slug: string };
};

export type NewLeaguePlanResult =
  | { readonly ok: true; readonly plan: NewLeaguePlan }
  | { readonly ok: false; readonly problems: readonly NewLeagueProblem[] };

const validTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

const email = z.email().max(320);
const leagueName = z.string().min(1).max(120);
const cityName = z.string().min(1).max(100);
const seasonName = z.string().min(1).max(120);

/**
 * The part of the year a date (YYYY-MM-DD) falls in, by its month (December to
 * February is winter), and the date's own year: a suggestion, which can be changed.
 */
export function seasonPartOf(day: string): { part: SeasonPart; year: number } {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const part: SeasonPart =
    month <= 2 || month === 12 ? 'winter' : month <= 5 ? 'spring' : month <= 8 ? 'summer' : 'fall';
  return { part, year };
}

/**
 * A season's short name made from its name: lower case, letters and numbers with one
 * hyphen between words (seasons.slug, 0003). "Fall 2026" becomes "fall-2026". A name
 * with no such letters becomes "season".
 */
export function seasonSlugOf(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return slug === '' ? 'season' : slug;
}

const text = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed === '' ? undefined : trimmed;
};

/** Why `read` could not use an answer: an object, so no answer can be mistaken for it. */
type Refusal = { readonly refused: 'invalid' | 'blocked' };
const invalid: Refusal = { refused: 'invalid' };
const blocked: Refusal = { refused: 'blocked' };
const isRefusal = (value: unknown): value is Refusal => value === invalid || value === blocked;

/** Checks every answer at once, so all the problems are told together. */
export function planNewLeague(answers: NewLeagueAnswers): NewLeaguePlanResult {
  const problems: NewLeagueProblem[] = [];
  const need = <T>(
    field: NewLeagueField,
    value: string | undefined,
    read: (value: string) => T | Refusal,
  ): T | undefined => {
    if (value === undefined) {
      problems.push({ field, problem: 'missing' });
      return undefined;
    }
    const result = read(value);
    if (isRefusal(result)) {
      problems.push({ field, problem: result.refused });
      return undefined;
    }
    return result;
  };
  const parsed =
    <T>(schema: z.ZodType<T>) =>
    (value: string): T | Refusal => {
      const result = schema.safeParse(value);
      return result.success ? result.data : invalid;
    };

  const name = need('name', text(answers.name), parsed(leagueName));
  const slug = need('shortName', text(answers.shortName)?.toLowerCase(), (value) => {
    if (!shortNameSchema.safeParse(value).success) return invalid;
    return isBlockedShortName(value) ? blocked : value;
  });
  const sportKey = need(
    'sport',
    text(answers.sport)?.toLowerCase(),
    (value) => offeredSports.find((sport) => sport === value) ?? invalid,
  );
  const audience = need('whoPlays', text(answers.whoPlays)?.toLowerCase(), (value) =>
    Object.hasOwn(whoPlaysChoices, value) ? whoPlaysChoices[value as WhoPlays] : invalid,
  );
  const city = need('city', text(answers.city), parsed(cityName));
  const timeZone = need('timeZone', text(answers.timeZone), (value) =>
    value.length <= 64 && validTimeZone(value) ? value : invalid,
  );
  const contactEmail = need('contactEmail', text(answers.contactEmail), parsed(email));
  const ownerEmail = need('ownerEmail', text(answers.ownerEmail), (value) => {
    // Erased accounts keep a placeholder on the reserved .invalid domain (record 007).
    if (/\.invalid$/i.test(value)) return invalid;
    return parsed(email)(value);
  });
  const season = need('seasonName', text(answers.seasonName), (value) => {
    const result = seasonName.safeParse(value);
    return result.success ? { name: result.data, slug: seasonSlugOf(result.data) } : invalid;
  });

  if (
    name === undefined ||
    slug === undefined ||
    sportKey === undefined ||
    audience === undefined ||
    city === undefined ||
    timeZone === undefined ||
    contactEmail === undefined ||
    ownerEmail === undefined ||
    season === undefined
  ) {
    return { ok: false, problems };
  }
  return {
    ok: true,
    plan: {
      name,
      slug,
      sportKey,
      audience,
      listed: listedByDefault[audience],
      city,
      timeZone,
      contactEmail,
      ownerEmail,
      season,
    },
  };
}
