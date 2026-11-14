// What the admin's games area needs from outside (step 2.55): the games commands'
// dependencies (the transaction runner over storage) and the names a page shows beside
// the ids the commands use. The league comes from each call's context, never from the
// request body. Today only the made-up stand-in fills it; the database-backed one comes
// with the web app's start on a database (steps 1.14 and 1.15).
import type { CommandDeps, GamesTx } from '@srleagues/core';

/** The words shown beside a league's games: teams by id, and who scores each game. */
export type GameNames = {
  readonly teams: Readonly<Record<string, string>>;
  /** Scorekeepers assigned to each game, by game id. */
  readonly scorekeepers: Readonly<Record<string, readonly string[]>>;
};

export type GamesAreaPorts = {
  /** What the games commands run on; the context in each call names the league. */
  readonly deps: CommandDeps<GamesTx>;
  readonly namesOf: (leagueId: string) => Promise<GameNames>;
};
