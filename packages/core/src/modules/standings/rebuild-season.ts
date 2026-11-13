// Works out a season's standings rows and player totals again from its results, and
// saves them in the transaction it is given (T3 §9, T6 §7). The handlers for "game
// finalized" and "game reopened" and the rebuild command both do exactly this, and the
// calculations are pure (packages/sports), so a rebuild from nothing gives the same
// rows as the running result.
//
// Results come from the games module (T-22): only final and forfeit games count for
// standings (S-9), only final games for player totals (S-11). Coin flips have no
// place to be stored yet (record 030), so teams no tiebreaker separates share a rank
// and take seeds in id order. Player totals hold every team's lines: who may see a
// player's numbers (S-22) is decided when they are shown (record 033).
import {
  calculateStandings,
  seasonTotals,
  type CaptureMode,
  type StandingsGame,
  type StandingsProblem,
  type StatsGame,
} from '@srleagues/sports';
import { seasonResults, type GameLine, type GameRecord } from '../games/index.ts';
import type { StandingsTx } from './ports.ts';

export type SeasonRebuilt = {
  /** Standings rows saved: one per team of the season. */
  readonly teams: number;
  /** Player totals saved: one per person who played in a counted game. */
  readonly players: number;
  /** Games, teams and adjustments left out or worth the admin's attention. */
  readonly problems: readonly StandingsProblem[];
};

const decided = (status: string): status is 'final' | 'forfeit' =>
  status === 'final' || status === 'forfeit';

const captureModes: readonly string[] = ['final', 'box', 'live'] satisfies CaptureMode[];
const isCaptureMode = (mode: string): mode is CaptureMode => captureModes.includes(mode);

/** The winner a decided game's scores give (as the database works out winner_team_id). */
function winnerOf(game: GameRecord): string | null {
  if (game.homeScore === null || game.awayScore === null) return null;
  if (game.homeScore > game.awayScore) return game.homeTeamId;
  if (game.awayScore > game.homeScore) return game.awayTeamId;
  return null;
}

function standingsGame(game: GameRecord & { status: 'final' | 'forfeit' }): StandingsGame {
  return {
    gameId: game.id,
    status: game.status,
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    winnerTeamId: winnerOf(game),
    // A game with no start time is ordered by when it was decided; with neither,
    // the calculation counts it and reports the missing time.
    startsAt: game.startsAt ?? game.finalizedAt ?? '',
  };
}

function statsGame(
  game: GameRecord & { status: 'final' | 'forfeit' },
  captureMode: CaptureMode,
  lines: readonly GameLine[],
): StatsGame {
  return {
    gameId: game.id,
    status: game.status,
    captureMode,
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    lines: lines.map((line) => ({
      teamId: line.teamId,
      personId: line.personId,
      played: line.played,
      secondsPlayed: line.secondsPlayed,
      stats: line.stats,
    })),
  };
}

/** Rebuilds the season's standings rows and player totals; nothing if it is not here. */
export async function rebuildSeason(tx: StandingsTx, seasonId: string): Promise<SeasonRebuilt> {
  await tx.standings.lockSeason(seasonId);
  const results = await seasonResults(tx, seasonId);
  if (results === undefined) return { teams: 0, players: 0, problems: [] };
  const teams = await tx.standings.listTeams(seasonId);
  const adjustments = await tx.standings.listAdjustments(seasonId);

  const linesByGame = new Map<string, GameLine[]>();
  for (const line of results.lines) {
    linesByGame.set(line.gameId, [...(linesByGame.get(line.gameId) ?? []), line]);
  }
  const games = results.games.filter((g): g is GameRecord & { status: 'final' | 'forfeit' } =>
    decided(g.status),
  );

  const standings = calculateStandings({
    teams: teams.map((t) => ({ teamId: t.teamId, divisionId: t.divisionId })),
    games: games.map(standingsGame),
    rules: results.rules,
    adjustments: adjustments.map((a) => ({
      adjustmentId: a.id,
      teamId: a.teamId,
      wins: a.wins,
      losses: a.losses,
      ties: a.ties,
      points: a.points,
      reason: a.reason,
    })),
    coinFlips: [],
  });
  const rows = standings.tables.flatMap((table) => table.rows);

  const totals = seasonTotals(
    games.flatMap((game) =>
      isCaptureMode(game.captureMode)
        ? [statsGame(game, game.captureMode, linesByGame.get(game.id) ?? [])]
        : [],
    ),
  );

  await tx.standings.replaceRows(seasonId, rows);
  await tx.standings.replaceTotals(seasonId, totals);
  return { teams: rows.length, players: totals.length, problems: standings.problems };
}
