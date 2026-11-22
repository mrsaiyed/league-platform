// The made-up leagues' states as the stand-in keeps them while the server runs (step
// 2.240): each starts as the cast says (stand-in-cast.ts), and publishing a draft changes
// it here, so a browser test can publish one and read it as a visitor. Kept in memory
// only, like every other change the stand-in makes; a restart starts from the cast again.
import type { LeagueStatus } from '@srleagues/core';

type Kept = { readonly status: LeagueStatus; readonly version: number };

const changed = new Map<string, Kept>();

/** The league's state now: the cast's, unless it was changed since the server started. */
export function standInStatusOf(league: {
  readonly id: string;
  readonly status: LeagueStatus;
}): LeagueStatus {
  return changed.get(league.id)?.status ?? league.status;
}

/** The version a change of state starts from (A-8): 1 until the state was changed. */
export function standInStatusVersion(leagueId: string): number {
  return changed.get(leagueId)?.version ?? 1;
}

/** Sets the state at `version`: the new version, or undefined if it moved since. */
export function setStandInStatus(
  leagueId: string,
  status: LeagueStatus,
  version: number,
): number | undefined {
  if (version !== standInStatusVersion(leagueId)) return undefined;
  const next = version + 1;
  changed.set(leagueId, { status, version: next });
  return next;
}
