// The order of one table (P7 §1, S-9). Teams are ranked by win percentage or by
// standings points; teams level on that are separated by the admin's tiebreakers
// in the admin's order. When a tiebreaker splits a group but leaves some teams
// still level, those teams start the list again from the first tiebreaker, now
// among themselves only, so head-to-head is worked out between just them. A
// tiebreaker that cannot apply (head-to-head between teams that have not all met,
// a coin flip not yet recorded) is passed over. Teams level after every
// tiebreaker share a place and are listed by id until the admin flips a coin.
import type { CountedGame } from './count-games.ts';
import { resultFor, standingPoints, type TeamRecord } from './team-records.ts';
import type { CoinFlip, DecidedBy, StandingsRules, Tiebreaker } from './types.ts';

/** One place in the table: one team, or several still tied after every tiebreaker. */
export interface Place {
  readonly teamIds: readonly string[];
  readonly decidedBy: DecidedBy;
}

/** A value to compare exactly: numerator over a positive denominator. Higher is better. */
interface Measure {
  readonly n: number;
  readonly d: number;
}

const whole = (n: number): Measure => ({ n, d: 1 });

function compareMeasures(a: Measure, b: Measure): number {
  return a.n * b.d - b.n * a.d;
}

/** A tie is half a win; no games is 0. */
function winPercentage(wins: number, losses: number, ties: number): Measure {
  const games = wins + losses + ties;
  if (games <= 0) return whole(0);
  return { n: 2 * wins + ties, d: 2 * games };
}

function byId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Splits teams into groups of equal measure, best group first. */
function partition(teamIds: readonly string[], measure: (teamId: string) => Measure): string[][] {
  const sorted = [...teamIds].sort((a, b) => compareMeasures(measure(b), measure(a)) || byId(a, b));
  const groups: string[][] = [];
  let previous: Measure | undefined;
  for (const teamId of sorted) {
    const value = measure(teamId);
    const last = groups[groups.length - 1];
    if (last && previous && compareMeasures(previous, value) === 0) last.push(teamId);
    else groups.push([teamId]);
    previous = value;
  }
  return groups;
}

export interface OrderContext {
  readonly records: ReadonlyMap<string, TeamRecord>;
  readonly games: readonly CountedGame[];
  readonly rules: StandingsRules;
  readonly coinFlips: readonly CoinFlip[];
}

function recordOf(context: OrderContext, teamId: string): TeamRecord {
  const record = context.records.get(teamId);
  if (!record) throw new Error(`No record for team ${teamId}`);
  return record;
}

/** The table's own measure: win percentage, or standings points. */
function primaryMeasure(context: OrderContext, teamId: string): Measure {
  const record = recordOf(context, teamId);
  if (record.points !== null) return whole(record.points);
  return winPercentage(record.wins, record.losses, record.ties);
}

/** Each team's measure under one tiebreaker, or undefined when it cannot apply. */
function tiebreakerMeasures(
  context: OrderContext,
  tiebreaker: Tiebreaker,
  group: readonly string[],
): ((teamId: string) => Measure) | undefined {
  switch (tiebreaker) {
    case 'head-to-head':
      return headToHead(context, group);
    case 'point-difference':
      return (teamId) => {
        const record = recordOf(context, teamId);
        return whole(record.pointsFor - record.pointsAgainst);
      };
    case 'points-scored':
      return (teamId) => whole(recordOf(context, teamId).pointsFor);
    case 'fewest-points-allowed':
      return (teamId) => whole(-recordOf(context, teamId).pointsAgainst);
    case 'coin-flip':
      return coinFlip(context, group);
  }
}

/**
 * The table's measure over games between teams of the group only: win percentage,
 * or in a points table points per game, so a team that met the others more often
 * gains nothing by it. It applies only when every team in the group has played at
 * least one of the others.
 */
function headToHead(
  context: OrderContext,
  group: readonly string[],
): ((teamId: string) => Measure) | undefined {
  const members = new Set(group);
  const tally = new Map<string, { wins: number; losses: number; ties: number }>();
  for (const teamId of group) tally.set(teamId, { wins: 0, losses: 0, ties: 0 });
  for (const game of context.games) {
    if (!members.has(game.homeTeamId) || !members.has(game.awayTeamId)) continue;
    for (const teamId of [game.homeTeamId, game.awayTeamId]) {
      const entry = tally.get(teamId);
      if (!entry) continue;
      const result = resultFor(game, teamId);
      if (result === 'won') entry.wins++;
      else if (result === 'lost') entry.losses++;
      else entry.ties++;
    }
  }
  for (const entry of tally.values()) {
    if (entry.wins + entry.losses + entry.ties === 0) return undefined;
  }
  return (teamId) => {
    const entry = tally.get(teamId) ?? { wins: 0, losses: 0, ties: 0 };
    const points = standingPoints(context.rules, entry);
    if (points === null) return winPercentage(entry.wins, entry.losses, entry.ties);
    return { n: points, d: entry.wins + entry.losses + entry.ties };
  };
}

/** The latest recorded flip that covers every team of the group, if there is one. */
function coinFlip(
  context: OrderContext,
  group: readonly string[],
): ((teamId: string) => Measure) | undefined {
  for (let i = context.coinFlips.length - 1; i >= 0; i--) {
    const flip = context.coinFlips[i];
    if (!flip || !group.every((teamId) => flip.includes(teamId))) continue;
    return (teamId) => whole(-flip.indexOf(teamId));
  }
  return undefined;
}

/** Orders a group of teams level on the table's measure. */
function breakTie(context: OrderContext, group: readonly string[]): Place[] {
  for (const tiebreaker of context.rules.tiebreakers) {
    const measure = tiebreakerMeasures(context, tiebreaker, group);
    if (!measure) continue;
    const parts = partition(group, measure);
    if (parts.length === 1) continue;
    return parts.flatMap((part): Place[] => {
      if (part.length === 1) return [{ teamIds: part, decidedBy: tiebreaker }];
      // Still level: start the list again among these teams only.
      return breakTie(context, part);
    });
  }
  return [{ teamIds: [...group].sort(byId), decidedBy: 'still-tied' }];
}

/** The places of one table, best first. */
export function orderTeams(teamIds: readonly string[], context: OrderContext): Place[] {
  return partition(teamIds, (teamId) => primaryMeasure(context, teamId)).flatMap(
    (group): Place[] =>
      group.length === 1 ? [{ teamIds: group, decidedBy: null }] : breakTie(context, group),
  );
}
