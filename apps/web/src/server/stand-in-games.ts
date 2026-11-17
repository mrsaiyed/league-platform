// THE GAMES AREA'S AND THE TRACKER'S LOCAL STAND-IN. FOR LOCAL WORK AND TESTS ONLY.
//
// The admin's games area (step 2.55) and the tracker's endpoints (step 2.32) on the one
// made-up world (stand-in-world.ts): the real games commands run on its rows, with core's
// own event handlers, so a final score, a forfeit, a box score or a tracked game that ends
// moves the season's standings and statistics in the same transaction, as on the
// database. A game's page and its snapshot read the same rows, so the public game page
// follows whatever the games area or the tracker saved.
import type { GameNames, GamesAreaPorts } from './games-area-ports.ts';
import type { NamesShownOf } from './name-policy-of.ts';
import { worldGameSnapshot } from './stand-in-world-reads.ts';
import type { World } from './stand-in-world.ts';
import type { TrackerPorts } from './tracker-ports.ts';

export { standInGameId, standInPlayerId } from './stand-in-world-seed.ts';

export type StandInGamesOptions = {
  /** The made-up people's names, by account id, for the scorekeeper shown on a game. */
  readonly people: Readonly<Record<string, string>>;
  /**
   * Who plays in each league and how it shows names, for the game's page, its snapshot
   * and its live messages: the league's privacy settings (T-81).
   */
  readonly namesShownOf: NamesShownOf;
};

/** The games area's ports, and the tracker's but for the live publisher, which the app adds. */
export type StandInGames = GamesAreaPorts & {
  readonly tracker: Omit<TrackerPorts, 'publisher'>;
};

export function standInGames(world: World, options: StandInGamesOptions): StandInGames {
  const deps = world.deps;
  const snapshotStoreOf = (leagueId: string) =>
    worldGameSnapshot(() => world.read(leagueId), world.now);
  return {
    deps,
    tracker: {
      deps,
      snapshotStoreOf,
      // The world's game reads with its league's name settings (record 076), and one
      // "today" for the whole read (R-28): who is a child is read on one day.
      gameReadsOf: async (leagueId, work) => {
        const moment = world.now();
        const store = worldGameSnapshot(
          () => world.read(leagueId),
          () => moment,
        );
        return work({ store, ...(await options.namesShownOf(leagueId)) });
      },
      namesShownOf: options.namesShownOf,
      displayNameOf: async (leagueId, accountId) =>
        (await world.read(leagueId)) === undefined ? '' : (options.people[accountId] ?? ''),
      clock: world.clock,
    },
    namesOf: async (leagueId): Promise<GameNames> => {
      const s = await world.read(leagueId);
      if (s === undefined) return { teams: {}, scorekeepers: {}, seasons: {} };
      const scorekeepers: Record<string, string[]> = {};
      for (const a of s.assignments) {
        (scorekeepers[a.gameId] ??= []).push(options.people[a.accountId] ?? '');
      }
      return {
        teams: Object.fromEntries(s.teams.map((t) => [t.id, t.name])),
        scorekeepers,
        seasons: Object.fromEntries(s.seasons.map((x) => [x.id, x.name])),
      };
    },
  };
}
