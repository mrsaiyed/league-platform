// What the admin's games area needs from outside (step 2.55): the games commands'
// dependencies (the transaction runner over storage) and the names a page shows beside
// the ids the commands use. The league comes from each call's context, never from the
// request body. The made-up stand-in fills it (stand-in-games.ts), and so does the
// database (database-games.ts, step 2.93 part 6, record 076).
import type { CommandDeps, StandingsTx, TrackerTx } from '@srleagues/core';

/** The words shown beside a league's games: teams by id, and who scores each game. */
export type GameNames = {
  readonly teams: Readonly<Record<string, string>>;
  /** Scorekeepers assigned to each game, by game id. */
  readonly scorekeepers: Readonly<Record<string, readonly string[]>>;
  /** Seasons by id: an earlier round of another season is named with its season (step 2.156). */
  readonly seasons: Readonly<Record<string, string>>;
};

export type GamesAreaPorts = {
  /**
   * What the games commands run on; the context in each call names the league. The
   * tracker's stores too, as reopening a game hands a tracked one back (step 2.30).
   */
  readonly deps: CommandDeps<TrackerTx>;
  /**
   * What the standings adjustments' commands run on (Admin → Standings and stats, step
   * 2.56): the same stores and the same event handlers, typed for the standings module.
   */
  readonly standingsDeps: CommandDeps<StandingsTx>;
  readonly namesOf: (leagueId: string) => Promise<GameNames>;
};
