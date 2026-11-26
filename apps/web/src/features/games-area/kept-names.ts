// The games area's map of names holds only names of games a command returned (step 2.227,
// T-475): the ports read every team, season and scorekeeper of the league, so the page keeps
// the teams, seasons and scorekeepers of the games it was given, and the teams and seasons a
// command named beside them (the later games' teams, the earlier rounds' seasons). Nothing
// of a game the holder may not read reaches the page or the data sent with it.
import type { GameNames } from '../../server/games-area-ports.ts';

/** A game as a command returned it: only what names are looked up by. */
export type NamedBy = {
  readonly id: string;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly seasonId?: string;
};

/** What a command named beside its games: teams and seasons by id. */
export type AlsoNamed = {
  readonly teamIds?: readonly string[];
  readonly seasonIds?: readonly string[];
};

const kept = <V>(all: Readonly<Record<string, V>>, ids: ReadonlySet<string>): Record<string, V> =>
  Object.fromEntries(Object.entries(all).filter(([id]) => ids.has(id)));

/** The names of these games only; the league's staff (`people`) are not the games list's. */
export function keptNames(
  all: GameNames,
  games: readonly NamedBy[],
  also: AlsoNamed = {},
): GameNames {
  const teams = new Set([
    ...games.flatMap((g) => [g.homeTeamId, g.awayTeamId]),
    ...(also.teamIds ?? []),
  ]);
  const seasons = new Set([
    ...games.flatMap((g) => (g.seasonId === undefined ? [] : [g.seasonId])),
    ...(also.seasonIds ?? []),
  ]);
  return {
    teams: kept(all.teams, teams),
    removedTeams: all.removedTeams.filter((id) => teams.has(id)),
    scorekeepers: kept(all.scorekeepers, new Set(games.map((g) => g.id))),
    seasons: kept(all.seasons, seasons),
    people: {},
  };
}
