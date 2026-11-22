// The order of one table (P7 §1, S-9). Teams are ranked by win percentage or by
// standings points; teams level on that are separated by the admin's tiebreakers
// in the admin's order. When a tiebreaker splits a group but leaves some teams
// still level, those teams start the list again from the first tiebreaker, now
// among themselves only, so head-to-head is worked out between just them. A
// tiebreaker that cannot apply (head-to-head between teams that have not all met,
// a coin flip not yet recorded) is passed over. Teams level after every
// tiebreaker share a place and are listed by id until the admin flips a coin.
//
// Head-to-head among three or more (S-74, decided for you): it counts every game the
// level teams played among themselves, and applies as soon as each of them has played
// at least one of the others.
//
// Beside the order, each set of level teams gets the steps that ordered it (LevelTeams):
// every tiebreaker tried, on which teams, with each team's place and figure under it.
// They are written down while the order is worked out and never change it.
import type { CountedGame } from './count-games.ts';
import { resultFor, standingPoints, type TeamRecord } from './team-records.ts';
import type {
  CoinFlip,
  DecidedBy,
  LevelTeams,
  StandingsRules,
  Tiebreaker,
  TiebreakPlace,
  TiebreakStep,
} from './types.ts';

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

interface Tally {
  wins: number;
  losses: number;
  ties: number;
}

/** Each team's wins, losses and ties in the games between teams of the group only. */
function tallyAmong(context: OrderContext, group: readonly string[]): Map<string, Tally> {
  const members = new Set(group);
  const tally = new Map<string, Tally>();
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
  return tally;
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
  const tally = tallyAmong(context, group);
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

/** A team's figure under a tiebreaker that has one, as the step tells it. */
function figureOf(context: OrderContext, tiebreaker: Tiebreaker, teamId: string): number | null {
  const record = recordOf(context, teamId);
  switch (tiebreaker) {
    case 'point-difference':
      return record.pointsFor - record.pointsAgainst;
    case 'points-scored':
      return record.pointsFor;
    case 'fewest-points-allowed':
      return record.pointsAgainst;
    case 'head-to-head':
    case 'coin-flip':
      return null;
  }
}

/** One tiebreaker tried on a group: `parts` as it left them, best first (one part: level). */
function stepOf(
  context: OrderContext,
  tiebreaker: Tiebreaker,
  applied: boolean,
  parts: readonly (readonly string[])[],
): TiebreakStep {
  const group = parts.flat();
  const tally = tiebreaker === 'head-to-head' ? tallyAmong(context, group) : undefined;
  const teams: TiebreakPlace[] = [];
  for (const part of parts) {
    // Teams of one part share the place after every team of the parts before it.
    const place = teams.length + 1;
    for (const teamId of part) {
      const entry = tally?.get(teamId);
      teams.push({
        teamId,
        place,
        value: figureOf(context, tiebreaker, teamId),
        record: entry ? { wins: entry.wins, losses: entry.losses, ties: entry.ties } : null,
      });
    }
  }
  return { tiebreaker, applied, teams };
}

interface Ordered {
  readonly places: readonly Place[];
  readonly steps: readonly TiebreakStep[];
}

/** Orders a group of teams level on the table's measure, and says how. */
function breakTie(context: OrderContext, group: readonly string[]): Ordered {
  const steps: TiebreakStep[] = [];
  for (const tiebreaker of context.rules.tiebreakers) {
    const measure = tiebreakerMeasures(context, tiebreaker, group);
    if (!measure) {
      steps.push(stepOf(context, tiebreaker, false, [group]));
      continue;
    }
    const parts = partition(group, measure);
    steps.push(stepOf(context, tiebreaker, true, parts));
    if (parts.length === 1) continue;
    const places: Place[] = [];
    for (const part of parts) {
      if (part.length === 1) {
        places.push({ teamIds: part, decidedBy: tiebreaker });
        continue;
      }
      // Still level: start the list again among these teams only.
      const inner = breakTie(context, part);
      places.push(...inner.places);
      steps.push(...inner.steps);
    }
    return { places, steps };
  }
  return { places: [{ teamIds: [...group].sort(byId), decidedBy: 'still-tied' }], steps };
}

/** The places of one table, best first, and for each set of level teams how it was ordered. */
export interface OrderedTable {
  readonly places: readonly Place[];
  readonly levels: readonly LevelTeams[];
}

/** The places of one table, best first, with the steps that ordered each set of level teams. */
export function orderTable(teamIds: readonly string[], context: OrderContext): OrderedTable {
  const places: Place[] = [];
  const levels: LevelTeams[] = [];
  for (const group of partition(teamIds, (teamId) => primaryMeasure(context, teamId))) {
    if (group.length === 1) {
      places.push({ teamIds: group, decidedBy: null });
      continue;
    }
    const ordered = breakTie(context, group);
    places.push(...ordered.places);
    levels.push({
      teamIds: ordered.places.flatMap((place) => place.teamIds),
      steps: ordered.steps,
    });
  }
  return { places, levels };
}

/** The places of one table, best first. */
export function orderTeams(teamIds: readonly string[], context: OrderContext): Place[] {
  return [...orderTable(teamIds, context).places];
}
