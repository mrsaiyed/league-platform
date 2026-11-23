// Works out a season's standings rows and player totals again from its results, and
// saves them in the transaction it is given (T3 §9, T6 §7). The handlers for "game
// finalized" and "game reopened" and the rebuild command both do exactly this, and the
// calculations are pure (packages/sports), so a rebuild from nothing gives the same
// rows as the running result.
//
// Results come from the games module (T-22): only final and forfeit games count for
// standings (S-9), only final games for player totals (S-11). Teams no tiebreaker
// separates share a rank and take seeds in id order until the admin records a coin
// flip for them (S-89, T-314): the season's flips go to the calculation, with the coin
// flip tried last when the season's tiebreakers do not name it, so a flip the admin
// recorded always counts (packages/sports applies it, order-teams.ts). Player totals hold every team's lines: who may see a
// player's numbers (S-22) is decided when they are shown (record 033).
import {
  calculateStandings,
  seasonTotals,
  type CaptureMode,
  type StandingsGame,
  type StandingsProblem,
  type StandingsResult,
  type StatsGame,
} from '@srleagues/sports';
import type { SeasonRules } from '@srleagues/contracts';
import {
  seasonResults,
  type GameLine,
  type GameRecord,
  type GamesStore,
  type SeasonResults,
} from '../games/index.ts';
import type { SeasonAdjustment, SeasonCoinFlip, StandingsStore, StandingsTx } from './ports.ts';

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

type Readers = {
  readonly standings: Pick<StandingsStore, 'listTeams' | 'listAdjustments' | 'listCoinFlips'>;
  readonly games: Pick<GamesStore, 'findSeason' | 'listDecided' | 'listDecidedLines'>;
};

/** What the season's results give under some rules; the standings calculation, run once. */
export type SeasonCalculation = {
  readonly results: SeasonResults;
  readonly games: readonly (GameRecord & { status: 'final' | 'forfeit' })[];
  readonly standings: StandingsResult;
};

/** The rules with the coin flip tried last when flips are recorded and the rules leave it out. */
export function withCoinFlipLast(
  rules: SeasonRules,
  flips: readonly SeasonCoinFlip[],
): SeasonRules {
  if (flips.length === 0 || rules.tiebreakers.includes('coin-flip')) return rules;
  return { ...rules, tiebreakers: [...rules.tiebreakers, 'coin-flip'] };
}

/**
 * Works the season's standings out from its results, its teams, its adjustments and its
 * coin flips, under `rules` when given (to see what a change would do) or else the
 * season's own; `withoutFlips` leaves the flips out, to see which teams are level after
 * every tiebreaker (the coin-flip screen). Saves nothing; undefined if the season is not here.
 */
export async function calculateSeason(
  tx: Readers,
  seasonId: string,
  rules?: SeasonRules,
  options: { readonly withoutFlips?: boolean } = {},
): Promise<SeasonCalculation | undefined> {
  const results = await seasonResults(tx, seasonId);
  if (results === undefined) return undefined;
  const teams = await tx.standings.listTeams(seasonId);
  const adjustments = await tx.standings.listAdjustments(seasonId);
  const flips = options.withoutFlips === true ? [] : await tx.standings.listCoinFlips(seasonId);
  const games = results.games.filter((g): g is GameRecord & { status: 'final' | 'forfeit' } =>
    decided(g.status),
  );
  const calculate = (counted: readonly SeasonAdjustment[]): StandingsResult =>
    calculateStandings({
      teams: teams.map((t) => ({ teamId: t.teamId, divisionId: t.divisionId })),
      games: games.map(standingsGame),
      rules: withCoinFlipLast(rules ?? results.rules, flips),
      adjustments: counted.map((a) => ({
        adjustmentId: a.id,
        teamId: a.teamId,
        wins: a.wins,
        losses: a.losses,
        ties: a.ties,
        points: a.points,
        reason: a.reason,
      })),
      coinFlips: flips.map((flip) => flip.teamIds),
    });
  const standings = withWholePairs(calculate, adjustments);
  return { results, games, standings: withAwardedGames(standings, adjustments) };
}

/**
 * The calculation with never one half of a pair (S-85, T-307) counted without the other:
 * packages/sports leaves out an adjustment that names a team not in the table or would
 * take a count below zero, so when it leaves out one half, the other is left out too,
 * with the same reason, and the calculation is run again without both.
 */
export function withWholePairs(
  calculate: (counted: readonly SeasonAdjustment[]) => StandingsResult,
  adjustments: readonly SeasonAdjustment[],
): StandingsResult {
  const partner = new Map<string, string>();
  for (const a of adjustments) {
    if (a.pairedWith === undefined || a.pairedWith === null) continue;
    partner.set(a.id, a.pairedWith);
    partner.set(a.pairedWith, a.id);
  }
  const withheld = new Map<string, StandingsProblem>();
  let standings = calculate(adjustments);
  // Each pass withholds at least one more pair, so this ends.
  for (;;) {
    const newly = standings.problems.filter((p) => {
      if (p.kind !== 'adjustment' || !p.leftOut || withheld.has(p.id)) return false;
      const other = partner.get(p.id);
      return other !== undefined && !withheld.has(other);
    });
    if (newly.length === 0) break;
    for (const p of newly) {
      withheld.set(p.id, p);
      const other = partner.get(p.id) ?? '';
      if (!withheld.has(other)) withheld.set(other, { ...p, id: other });
    }
    standings = calculate(adjustments.filter((a) => !withheld.has(a.id)));
  }
  if (withheld.size === 0) return standings;
  const problems = [...standings.problems, ...withheld.values()].sort(
    (a, b) => order(a.kind, b.kind) || order(a.id, b.id) || order(a.reason, b.reason),
  );
  return { ...standings, problems };
}

const order = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Adds the games played of a game awarded that was not played (S-85) to the rows its
 * adjustments changed, so a record still adds up; the calculation counts only games
 * actually played (packages/sports), which every other adjustment leaves alone.
 */
function withAwardedGames(
  standings: StandingsResult,
  adjustments: readonly SeasonAdjustment[],
): StandingsResult {
  const added = new Map(adjustments.map((a) => [a.id, a.gamesPlayed ?? 0]));
  if (![...added.values()].some((n) => n !== 0)) return standings;
  return {
    ...standings,
    tables: standings.tables.map((table) => ({
      ...table,
      rows: table.rows.map((row) => ({
        ...row,
        gamesPlayed:
          row.gamesPlayed +
          row.adjustments.reduce((sum, a) => sum + (added.get(a.adjustmentId) ?? 0), 0),
      })),
    })),
  };
}

/** Rebuilds the season's standings rows and player totals; nothing if it is not here. */
export async function rebuildSeason(tx: StandingsTx, seasonId: string): Promise<SeasonRebuilt> {
  await tx.standings.lockSeason(seasonId);
  const calculation = await calculateSeason(tx, seasonId);
  if (calculation === undefined) return { teams: 0, players: 0, problems: [] };
  const { results, games, standings } = calculation;
  const rows = standings.tables.flatMap((table) => table.rows);

  const linesByGame = new Map<string, GameLine[]>();
  for (const line of results.lines) {
    linesByGame.set(line.gameId, [...(linesByGame.get(line.gameId) ?? []), line]);
  }
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
