// The fixed words and numbers of a league (T3 §4, U-3, U-7, U-9, U-10, U-12).
// Product rules live here as data, not in the command files.

export const leagueStatuses = ['draft', 'live', 'archived', 'suspended'] as const;
export type LeagueStatus = (typeof leagueStatuses)[number];

/** Where a season is in its life (T3 �4): being set up, running, or over and still shown. */
export const seasonStatuses = ['draft', 'active', 'completed'] as const;
export type SeasonStatus = (typeof seasonStatuses)[number];

export const audiences = ['adult', 'youth', 'mixed'] as const;
export type Audience = (typeof audiences)[number];

/** U-10: listed in /find by default for adult leagues only; "mixed" is treated like youth. */
export const listedByDefault: Readonly<Record<Audience, boolean>> = {
  adult: true,
  youth: false,
  mixed: false,
};

/** The hidden default program every league has (U-3, U-12). Its name is the league's own. */
export const defaultProgramSlug = 'main';

/** U-7: an old short name keeps forwarding for this long. */
export const shortNameForwardingMonths = 12;
