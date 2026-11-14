// The part of the games store the box score grid uses (step 2.64), on plain data, for
// core's tests: a game's lines, the players of its two teams, and whether the tracker
// has recorded plays for it. The database's own rule (one line per person per game,
// for a team in the game) is stood in for by a check.
import type {
  GameLine,
  GameRecord,
  GameRosterPlayer,
  GamesStore,
} from '../../modules/games/index.ts';

export type BoxScoreData = {
  games: GameRecord[];
  lines: GameLine[];
  /** Players on teams' rosters, by team. */
  roster: GameRosterPlayer[];
  /** Games the tracker has recorded plays for. */
  tracked: string[];
};

type BoxScoreStores = Pick<GamesStore, 'listLines' | 'replaceLines' | 'listRoster' | 'hasPlays'>;

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
    listRoster: async (gameId) => {
      const teams = teamsOf(gameId);
      return s.roster.filter((player) => teams.includes(player.teamId));
    },
    hasPlays: async (gameId) => s.tracked.includes(gameId),
  };
}
