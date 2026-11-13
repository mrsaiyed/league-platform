// Which games count, and what each one counts as (S-9, S-11, P7 §5.6). Final and
// forfeit games count; scheduled, live, postponed and cancelled games count for
// nothing. A game that cannot be read is left out and reported, never guessed at.
import type {
  StandingsGame,
  StandingsProblem,
  StandingsProblemReason,
  StandingsRules,
} from './types.ts';

export interface CountedGame {
  readonly gameId: string;
  /** Milliseconds since 1970, or null when the start time could not be read. */
  readonly time: number | null;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  /** null: a tie. */
  readonly winnerTeamId: string | null;
  /** What each side adds to points for and against; null when it adds nothing. */
  readonly points: { readonly home: number; readonly away: number } | null;
}

export interface CountedGames {
  readonly counted: readonly CountedGame[];
  readonly problems: readonly StandingsProblem[];
}

export interface KnownTeams {
  /** Teams listed once. */
  readonly listed: ReadonlySet<string>;
  /** Teams listed more than once, and so left out. */
  readonly duplicated: ReadonlySet<string>;
}

const isScore = (value: number): boolean => Number.isInteger(value) && value >= 0;

/** Earliest first; a game whose start time cannot be read comes before all others, then by id. */
export function compareGamesByTime(a: CountedGame, b: CountedGame): number {
  const at = a.time ?? Number.NEGATIVE_INFINITY;
  const bt = b.time ?? Number.NEGATIVE_INFINITY;
  if (at !== bt) return at < bt ? -1 : 1;
  return a.gameId < b.gameId ? -1 : a.gameId > b.gameId ? 1 : 0;
}

export function countGames(
  games: readonly StandingsGame[],
  teams: KnownTeams,
  rules: StandingsRules,
): CountedGames {
  const copies = new Map<string, number>();
  for (const game of games) copies.set(game.gameId, (copies.get(game.gameId) ?? 0) + 1);

  const counted: CountedGame[] = [];
  const problems: StandingsProblem[] = [];
  const problem = (id: string, reason: StandingsProblemReason, leftOut = true): void => {
    problems.push({ kind: 'game', id, reason, leftOut });
  };
  const reported = new Set<string>();

  for (const game of games) {
    const { gameId, homeTeamId, awayTeamId } = game;
    // Two games with one id cannot both be right, and keeping either would depend
    // on the order they arrived in, so neither counts.
    if ((copies.get(gameId) ?? 0) > 1) {
      if (!reported.has(gameId)) problem(gameId, 'duplicate-game-id');
      reported.add(gameId);
      continue;
    }
    if (game.status !== 'final' && game.status !== 'forfeit') continue;
    if (homeTeamId === awayTeamId) {
      problem(gameId, 'same-team-twice');
      continue;
    }
    if (teams.duplicated.has(homeTeamId) || teams.duplicated.has(awayTeamId)) {
      problem(gameId, 'team-listed-twice');
      continue;
    }
    if (!teams.listed.has(homeTeamId) || !teams.listed.has(awayTeamId)) {
      problem(gameId, 'unknown-team');
      continue;
    }

    let result: Pick<CountedGame, 'winnerTeamId' | 'points'>;
    if (game.status === 'forfeit') {
      // Recorded at the league's forfeit score, whatever score the game carries.
      const winner = game.winnerTeamId;
      if (winner === null) {
        problem(gameId, 'forfeit-without-winner');
        continue;
      }
      if (winner !== homeTeamId && winner !== awayTeamId) {
        problem(gameId, 'winner-not-in-game');
        continue;
      }
      const { winnerScore, loserScore, countsInPointDifference } = rules.forfeit;
      const homeWon = winner === homeTeamId;
      result = {
        winnerTeamId: winner,
        points: countsInPointDifference
          ? { home: homeWon ? winnerScore : loserScore, away: homeWon ? loserScore : winnerScore }
          : null,
      };
    } else {
      const home = game.homeScore;
      const away = game.awayScore;
      if (home === null || away === null) {
        problem(gameId, 'missing-score');
        continue;
      }
      if (!isScore(home) || !isScore(away)) {
        problem(gameId, 'invalid-score');
        continue;
      }
      // A tie is a fact of a final game; when the season does not allow ties it still
      // counts as one, and the admin is told.
      if (home === away && !rules.allowTies) problem(gameId, 'tie-not-allowed', false);
      result = {
        winnerTeamId: home > away ? homeTeamId : away > home ? awayTeamId : null,
        points: { home, away },
      };
    }

    const time = Date.parse(game.startsAt);
    if (!Number.isFinite(time)) problem(gameId, 'invalid-start-time', false);
    counted.push({
      gameId,
      time: Number.isFinite(time) ? time : null,
      homeTeamId,
      awayTeamId,
      ...result,
    });
  }

  return { counted, problems };
}
