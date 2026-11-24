// The fixed words and numbers of a league (T3 §4, U-3, U-7, U-9, U-10, U-12).
// Product rules live here as data, not in the command files.

export const leagueStatuses = ['draft', 'live', 'archived', 'suspended'] as const;
export type LeagueStatus = (typeof leagueStatuses)[number];

/** Where a season is in its life (T3 �4): being set up, running, or over and still shown. */
export const seasonStatuses = ['draft', 'active', 'completed'] as const;
export type SeasonStatus = (typeof seasonStatuses)[number];

/** A hidden season (A-18): still being set up, which visitors do not see. */
export const hiddenSeasonStatus = 'draft' satisfies SeasonStatus;

/** An archived season (step 2.130, O-12, T-376): over, still shown, read-only. */
export const archivedSeasonStatus = 'completed' satisfies SeasonStatus;

/** What "Start a new season" brings besides the last season's setup (P3 §5, T-378). */
export const seasonCarryChoices = ['nothing', 'teams', 'teams-and-rosters'] as const;
export type SeasonCarry = (typeof seasonCarryChoices)[number];

export const audiences = ['adult', 'youth', 'mixed'] as const;
export type Audience = (typeof audiences)[number];

/** The sports a league may be made for (P3 §1 step 2: basketball, for now; B-6). */
export const offeredSports = ['basketball'] as const;
export type OfferedSport = (typeof offeredSports)[number];

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
