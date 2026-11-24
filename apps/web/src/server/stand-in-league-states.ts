// The made-up leagues' states as the stand-in keeps them while the server runs (step
// 2.240): each starts as the cast says (stand-in-cast.ts), and publishing a draft changes
// it here, so a browser test can publish one and read it as a visitor. Step 2.125 keeps a
// league's own name and short name here too (League settings → Profile), the old short
// name forwarding as the leagues table's former names do. Kept in memory only, like every
// other change the stand-in makes; a restart starts from the cast again.
import type { LeagueStatus } from '@srleagues/core';

type CastFacts = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: LeagueStatus;
  readonly formerSlugs?: readonly string[];
};

type Kept = {
  readonly status?: LeagueStatus;
  readonly name?: string;
  readonly slug?: string;
  /** Short names given up since the server started, each still forwarding. */
  readonly formerSlugs?: readonly string[];
  readonly version: number;
};

const changed = new Map<string, Kept>();

/** The league's state now: the cast's, unless it was changed since the server started. */
export function standInStatusOf(league: {
  readonly id: string;
  readonly status: LeagueStatus;
}): LeagueStatus {
  return changed.get(league.id)?.status ?? league.status;
}

/** The league's own name and short name now, and every short name that forwards to it. */
export function standInNamesOf(league: CastFacts): {
  readonly name: string;
  readonly slug: string;
  readonly formerSlugs: readonly string[];
} {
  const kept = changed.get(league.id);
  return {
    name: kept?.name ?? league.name,
    slug: kept?.slug ?? league.slug,
    formerSlugs: [...(league.formerSlugs ?? []), ...(kept?.formerSlugs ?? [])],
  };
}

/** Whether `shortName` is the league's short name now, or one that forwards to it. */
export function standInAnswersTo(league: CastFacts, shortName: string): boolean {
  const names = standInNamesOf(league);
  return names.slug === shortName || names.formerSlugs.includes(shortName);
}

/** The version a change starts from (A-8): 1 until the league was changed. */
export function standInStatusVersion(leagueId: string): number {
  return changed.get(leagueId)?.version ?? 1;
}

/** Changes the league at `version`: the new version, or undefined if it moved since. */
export function changeStandInLeague(
  leagueId: string,
  version: number,
  change: Omit<Kept, 'version'> = {},
): number | undefined {
  if (version !== standInStatusVersion(leagueId)) return undefined;
  const next = version + 1;
  changed.set(leagueId, { ...changed.get(leagueId), ...change, version: next });
  return next;
}

/** Sets the state at `version`: the new version, or undefined if it moved since. */
export function setStandInStatus(
  leagueId: string,
  status: LeagueStatus,
  version: number,
): number | undefined {
  return changeStandInLeague(leagueId, version, { status });
}

/**
 * Gives the league the short name `slug` at `version`, the old one forwarding: 'taken' if
 * another league answers to it now, undefined if the version moved.
 */
export function renameStandInLeague(
  league: CastFacts,
  everyLeague: readonly CastFacts[],
  slug: string,
  version: number,
): number | 'taken' | undefined {
  if (everyLeague.some((other) => other.id !== league.id && standInAnswersTo(other, slug))) {
    return 'taken';
  }
  const names = standInNamesOf(league);
  const given = changed.get(league.id)?.formerSlugs ?? [];
  return changeStandInLeague(league.id, version, {
    slug,
    formerSlugs: [...given.filter((s) => s !== slug), names.slug],
  });
}

/** Back to the cast's states: for a test that changes a made-up league more than once. */
export function forgetStandInStatuses(): void {
  changed.clear();
}
