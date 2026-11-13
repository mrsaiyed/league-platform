// What the public standings and statistics pages need from outside (step 2.43): the
// league's seasons, how it shows names, its minimum-games rule, and the read store the
// core queries (step 2.40) run on. Bound to one league by the caller, so nothing here
// takes a league from the request (T-28).
import type { Audience, NamePolicy, StandingsReadStore } from '@srleagues/core';

/** A season the public may pick: its address name (`?season=`) and whether it is the current one. */
export type PublicSeason = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly isCurrent: boolean;
};

/** How the league shows its statistics: read from the league's own settings. */
export type PublicStatsSettings = {
  readonly audience: Audience;
  readonly namePolicy: NamePolicy;
  /** The league's minimum games for leaders; 0 means no minimum. */
  readonly minimumGames: number;
};

export type PublicStatsPorts = {
  /** The league's seasons that the public may see, newest first. */
  readonly seasonsOf: (leagueId: string) => Promise<readonly PublicSeason[]>;
  readonly settingsOf: (leagueId: string) => Promise<PublicStatsSettings>;
  /** The standings and statistics reads, bound to this league. */
  readonly readStoreOf: (leagueId: string) => StandingsReadStore;
};
