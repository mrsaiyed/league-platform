// What the public standings and statistics pages need from outside (step 2.43): the
// league's seasons, how it shows names, its minimum-games rule, and the read store the
// core queries (step 2.40) run on. Bound to one league by the caller, so nothing here
// takes a league from the request (T-28).
import type {
  Audience,
  NamePolicy,
  PublicRoster,
  ReadStandingsError,
  Result,
  Standings,
  StandingsReadStore,
  Viewer,
} from '@srleagues/core';

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

/** A page's statistics reads, a team's roster and the league's name settings, taken together. */
export type StatisticsRead = {
  readonly store: StandingsReadStore;
  readonly settings: PublicStatsSettings;
  /**
   * One team's roster: those on it now, then those who left (R-17); names by the one name
   * function (T-81) under `settings`, read in the same snapshot as the statistics, so one
   * child is never shown two ways on one page (record 070). Asked inside `work` only.
   */
  readonly rosterOf: (teamId: string, viewer: Viewer) => Promise<PublicRoster>;
};

export type PublicStatsPorts = {
  /** The league's seasons that the public may see, newest first. */
  readonly seasonsOf: (leagueId: string) => Promise<readonly PublicSeason[]>;
  readonly settingsOf: (leagueId: string) => Promise<PublicStatsSettings>;
  /**
   * The standings and statistics reads, bound to this league. On the database a person's
   * name is not read here (T-81, record 070): every page that shows one reads it through
   * statisticsOf, with the league's own settings.
   */
  readonly readStoreOf: (leagueId: string) => StandingsReadStore;
  /**
   * `work` over one snapshot of the league (T-81, record 070): the statistics reads, a
   * team's roster and the league's own name settings and audience, read in the same
   * snapshot on the database, so a name is always shown by the settings as they stood at
   * one moment.
   */
  readonly statisticsOf: <T>(
    leagueId: string,
    work: (read: StatisticsRead) => Promise<T>,
  ) => Promise<T>;
  /** A season's standings (core's readStandings), its reads taken as one snapshot. */
  readonly standingsOf: (
    leagueId: string,
    seasonId: string,
  ) => Promise<Result<Standings, ReadStandingsError>>;
};
