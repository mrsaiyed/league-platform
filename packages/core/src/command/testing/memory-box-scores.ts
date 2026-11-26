// The part of the games store the box score grid uses (step 2.64), on plain data, for
// core's tests: a game's lines, the players of its two teams, and whether the tracker
// has recorded plays for it. The database's own rule (one line per person per game,
// for a team in the game) is stood in for by a check.
import {
  namedRoster,
  type GameLine,
  type GameRecord,
  type GamesStore,
  type RecordedRosterPlayer,
} from '../../modules/games/index.ts';

export type BoxScoreData = {
  games: GameRecord[];
  lines: GameLine[];
  /**
   * Players on teams' rosters, by team, as recorded: listRoster names them by the scoring
   * screens' rule (R-33) in an adult league, where nothing else is said.
   */
  roster: RecordedRosterPlayer[];
  /** Games the tracker has recorded plays for. */
  tracked: string[];
};

type BoxScoreStores = Pick<
  GamesStore,
  'listLines' | 'replaceLines' | 'listRoster' | 'inBin' | 'hasPlays'
>;

export function boxScoreStores(s: BoxScoreData): BoxScoreStores {
  const teamsOf = (gameId: string) => {
    const game = s.games.find((g) => g.id === gameId);
    return game === undefined ? [] : [game.homeTeamId, game.awayTeamId];
  };
  return {
    listLines: async (gameId) => s.lines.filter((line) => line.gameId === gameId),
    replaceLines: async (gameId, lines) => {
      const teams = teamsOf(gameId);
      const people = new Set<string>();
      for (const line of lines) {
        if (!teams.includes(line.teamId) || people.has(line.personId)) {
          throw new Error('The database refuses a line for a team not in the game, or twice.');
        }
        people.add(line.personId);
      }
      s.lines = [
        ...s.lines.filter((line) => line.gameId !== gameId),
        ...lines.map(({ jerseyNumber: _jersey, ...line }) => line),
      ];
    },
    listRoster: async (gameId, names) => {
      const teams = teamsOf(gameId);
      const players = s.roster.filter((player) => teams.includes(player.teamId));
      return namedRoster(players, { ...names, audience: 'adult' });
    },
    // No bin here: a player missing from the roster is purged (the database test tells them apart).
    inBin: async () => false,
    hasPlays: async (gameId) => s.tracked.includes(gameId),
  };
}
