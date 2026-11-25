// What the internal tool that makes a league (P3 §8, step 2.125) is asked, checked
// before anything is made: the questions of P3 §1 step 2 (name, short name, sport,
// who plays, where), whether it is listed, the contact email, the owner's email, the
// first season's name and rough dates (step 4: "Rough dates: optional"), and the email
// of the member of our staff who makes it, and the starting design its site opens in,
// with any main, accent and highlight colors chosen in place of the design's own (step
// 2.187, P5 §2; left out, the first starting design, C-16). Pure: it reads nothing and
// makes nothing.
// The commands check everything again when they run.
import {
  defaultSeasonRules,
  designColorPattern,
  firstStartingDesign,
  isStartingDesignKey,
  type StartingColors,
  type StartingDesignKey,
} from '@srleagues/contracts';
import { z } from 'zod';
import { clockModes, withGameRuleAnswers, type ClockMode } from './game-rule-answers.ts';
import { isBlockedShortName, isSystemShortName, shortNameSchema } from '../short-names.ts';
import { namedTimeZone } from '../time-zone.ts';
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
  /** "yes" or "no"; when left out, U-10's rule by who plays decides. */
  readonly listed?: string | undefined;
  readonly city?: string | undefined;
  readonly timeZone?: string | undefined;
  readonly contactEmail?: string | undefined;
  readonly ownerEmail?: string | undefined;
  readonly seasonName?: string | undefined;
  /** YYYY-MM-DD, optional. */
  readonly seasonStartsOn?: string | undefined;
  /** YYYY-MM-DD, optional; not before the start. */
  readonly seasonEndsOn?: string | undefined;
  /** The member of our staff who makes it (P3 §8). */
  readonly staffEmail?: string | undefined;
  /** One of the starting designs, by its key; left out, the first one (C-16). */
  readonly design?: string | undefined;
  /** Colors written #rrggbb, in place of the starting design's own; each optional. */
  readonly mainColor?: string | undefined;
  readonly accentColor?: string | undefined;
  readonly highlightColor?: string | undefined;
  /** The game rules asked (S-106, step 2.245): "stop" or "running"; left out, the default. */
  readonly clock?: string | undefined;
  /** Points of lead for the mercy rule, or "none"; left out, none. */
  readonly mercyLead?: string | undefined;
};

export const newLeagueFields = [
  'name',
  'shortName',
  'sport',
  'whoPlays',
  'listed',
  'city',
  'timeZone',
  'contactEmail',
  'ownerEmail',
  'seasonName',
  'seasonStartsOn',
  'seasonEndsOn',
  'staffEmail',
  'design',
  'mainColor',
  'accentColor',
  'highlightColor',
  'clock',
  'mercyLead',
] as const;
export type NewLeagueField = (typeof newLeagueFields)[number];

/** Why one answer cannot be used. */
export type NewLeagueProblem = {
  readonly field: NewLeagueField;
  /** 'blocked': one of our own words; 'offensive': on the list of offensive words (U-16). */
  readonly problem: 'missing' | 'invalid' | 'blocked' | 'offensive' | 'before-start';
};

/** A league ready to make, with its first season. */
export type NewLeaguePlan = {
  readonly name: string;
  readonly slug: string;
  readonly sportKey: OfferedSport;
  readonly audience: Audience;
  /** Listed in the league finder, /find. */
  readonly listed: boolean;
  /** True when the answers chose `listed`; false when U-10's rule by who plays did. */
  readonly listedChosen: boolean;
  readonly city: string;
  /** A named zone, by its canonical name (time-zone.ts). */
  readonly timeZone: string;
  readonly contactEmail: string;
  /** Written as given, spaces dropped; accounts are matched whatever its capitals. */
  readonly ownerEmail: string;
  /** The same, for the member of our staff who makes it. */
  readonly staffEmail: string;
  readonly season: {
    readonly name: string;
    readonly slug: string;
    readonly startsOn: string | null;
    readonly endsOn: string | null;
  };
  /** The site's first release: a starting design and the colors chosen in place of its own. */
  readonly design: {
    readonly startingDesign: StartingDesignKey;
    /** True when the answers named it; false when it is the first one by default. */
    readonly chosen: boolean;
    readonly colors: StartingColors;
  };
  /** The first season's game rules, checked by the settings' contract; defaults when left. */
  readonly gameRules: { readonly clockMode: ClockMode; readonly mercyLead: number | null };
};

export type NewLeaguePlanResult =
  | { readonly ok: true; readonly plan: NewLeaguePlan }
  | { readonly ok: false; readonly problems: readonly NewLeagueProblem[] };

const email = z.email().max(320);
const leagueName = z.string().min(1).max(120);
const cityName = z.string().min(1).max(100);
const seasonName = z.string().min(1).max(120);

/** A real calendar date written YYYY-MM-DD: 2026-02-30 is not one. */
function isCalendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Today's date (YYYY-MM-DD) at `at` (milliseconds) in a time zone the runtime knows. */
export function dayIn(timeZone: string, at: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(at));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** A suggested season: the part of the year, and the year or the two years it spans. */
export type SeasonSuggestion = {
  readonly part: SeasonPart;
  readonly years: readonly [number] | readonly [number, number];
};

/**
 * The part of the year a date (YYYY-MM-DD) falls in, by its month, and its year. A
 * winter runs from December into the next year, so it names both years: December
 * 2026, January and February 2027 all give Winter 2026–2027. A suggestion, which can
 * be changed.
 */
export function seasonPartOf(day: string): SeasonSuggestion {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  if (month === 12) return { part: 'winter', years: [year, year + 1] };
  if (month <= 2) return { part: 'winter', years: [year - 1, year] };
  return { part: month <= 5 ? 'spring' : month <= 8 ? 'summer' : 'fall', years: [year] };
}

/** The season suggested at `at` for a league in `timeZone`: by the league's own date. */
export function suggestedSeason(at: number, timeZone: string): SeasonSuggestion {
  return seasonPartOf(dayIn(timeZone, at));
}

/**
 * A season's short name made from its name: lower case, letters and numbers with one
 * hyphen between words (seasons.slug, 0003). "Fall 2026" becomes "fall-2026". A name
 * with no such letters becomes "season".
 */
export function seasonSlugOf(name: string): string {
  const slug = name
    .normalize('NFKD')
    // The combining accents NFKD splits off ("é" becomes "e" and an accent).
    .replace(/[\u0300-\u036f]/g, '')
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
type Refusal = { readonly refused: 'invalid' | 'blocked' | 'offensive' };
const invalid: Refusal = { refused: 'invalid' };
const blocked: Refusal = { refused: 'blocked' };
const offensive: Refusal = { refused: 'offensive' };
const isRefusal = (value: unknown): value is Refusal =>
  value === invalid || value === blocked || value === offensive;

/** Checks every answer at once, so all the problems are told together. */
export function planNewLeague(answers: NewLeagueAnswers): NewLeaguePlanResult {
  const problems: NewLeagueProblem[] = [];
  const check = <T>(
    field: NewLeagueField,
    value: string | undefined,
    read: (value: string) => T | Refusal,
  ): T | undefined => {
    if (value === undefined) return undefined;
    const result = read(value);
    if (isRefusal(result)) {
      problems.push({ field, problem: result.refused });
      return undefined;
    }
    return result;
  };
  const need = <T>(
    field: NewLeagueField,
    value: string | undefined,
    read: (value: string) => T | Refusal,
  ): T | undefined => {
    if (value === undefined) problems.push({ field, problem: 'missing' });
    return check(field, value, read);
  };
  const parsed =
    <T>(schema: z.ZodType<T>) =>
    (value: string): T | Refusal => {
      const result = schema.safeParse(value);
      return result.success ? result.data : invalid;
    };
  // Erased accounts keep a placeholder on the reserved .invalid domain (record 007),
  // and a sign-in is refused there (0012): such an address can never sign in.
  const personEmail = (value: string) =>
    /\.invalid$/i.test(value) ? invalid : parsed(email)(value);
  const calendarDay = (value: string) => (isCalendarDay(value) ? value : invalid);

  const name = need('name', text(answers.name), parsed(leagueName));
  const slug = need('shortName', text(answers.shortName)?.toLowerCase(), (value) => {
    if (!shortNameSchema.safeParse(value).success) return invalid;
    // Which of the two it was is said: one of our words, or an offensive one.
    if (isSystemShortName(value)) return blocked;
    return isBlockedShortName(value) ? offensive : value;
  });
  const sportKey = need(
    'sport',
    text(answers.sport)?.toLowerCase(),
    (value) => offeredSports.find((sport) => sport === value) ?? invalid,
  );
  const audience = need('whoPlays', text(answers.whoPlays)?.toLowerCase(), (value) =>
    Object.hasOwn(whoPlaysChoices, value) ? whoPlaysChoices[value as WhoPlays] : invalid,
  );
  const listedAnswer = text(answers.listed)?.toLowerCase();
  const listedChoice = check('listed', listedAnswer, (value) =>
    value === 'yes' ? true : value === 'no' ? false : invalid,
  );
  const city = need('city', text(answers.city), parsed(cityName));
  const timeZone = need(
    'timeZone',
    text(answers.timeZone),
    (value) => namedTimeZone(value) ?? invalid,
  );
  const contactEmail = need('contactEmail', text(answers.contactEmail), parsed(email));
  const ownerEmail = need('ownerEmail', text(answers.ownerEmail), personEmail);
  const season = need('seasonName', text(answers.seasonName), (value) => {
    const result = seasonName.safeParse(value);
    return result.success ? { name: result.data, slug: seasonSlugOf(result.data) } : invalid;
  });
  const startsOn = check('seasonStartsOn', text(answers.seasonStartsOn), calendarDay);
  const endsOn = check('seasonEndsOn', text(answers.seasonEndsOn), calendarDay);
  if (startsOn !== undefined && endsOn !== undefined && endsOn < startsOn) {
    problems.push({ field: 'seasonEndsOn', problem: 'before-start' });
  }
  const staffEmail = need('staffEmail', text(answers.staffEmail), personEmail);
  const designAnswer = text(answers.design)?.toLowerCase();
  const startingDesign = check('design', designAnswer, (value) =>
    isStartingDesignKey(value) ? value : invalid,
  );
  const color = (value: string) => (designColorPattern.test(value) ? value.toLowerCase() : invalid);
  const primary = check('mainColor', text(answers.mainColor), color);
  const accent = check('accentColor', text(answers.accentColor), color);
  const highlight = check('highlightColor', text(answers.highlightColor), color);
  const clockMode = check(
    'clock',
    text(answers.clock)?.toLowerCase(),
    (value) => clockModes.find((mode) => mode === value) ?? invalid,
  );
  const mercyLead = check('mercyLead', text(answers.mercyLead)?.toLowerCase(), (value) =>
    value === 'none' ? null : /^\d{1,3}$/.test(value) ? Number(value) : invalid,
  );
  const gameRules = withGameRuleAnswers(defaultSeasonRules(), {
    ...(clockMode === undefined ? {} : { clockMode }),
    ...(mercyLead === undefined ? {} : { mercyLead }),
  });
  if (!gameRules.ok && !problems.some((p) => p.field === 'clock' || p.field === 'mercyLead')) {
    problems.push({
      field: gameRules.question === 'clockMode' ? 'clock' : 'mercyLead',
      problem: 'invalid',
    });
  }

  if (
    problems.length > 0 ||
    name === undefined ||
    slug === undefined ||
    sportKey === undefined ||
    audience === undefined ||
    city === undefined ||
    timeZone === undefined ||
    contactEmail === undefined ||
    ownerEmail === undefined ||
    season === undefined ||
    staffEmail === undefined ||
    !gameRules.ok
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
      listed: listedChoice ?? listedByDefault[audience],
      listedChosen: listedChoice !== undefined,
      city,
      timeZone,
      contactEmail,
      ownerEmail,
      staffEmail,
      season: { ...season, startsOn: startsOn ?? null, endsOn: endsOn ?? null },
      design: {
        startingDesign: startingDesign ?? firstStartingDesign,
        chosen: startingDesign !== undefined,
        colors: {
          ...(primary === undefined ? {} : { primary }),
          ...(accent === undefined ? {} : { accent }),
          ...(highlight === undefined ? {} : { highlight }),
        },
      },
      gameRules: {
        clockMode: gameRules.rules.clock.mode,
        mercyLead: gameRules.rules.clock.mercyLead,
      },
    },
  };
}
