// Development-only (T-195, T-201), step 2.236 (fix round): what the plan meant to happen,
// worked out again with plain arithmetic, for the self-check (simulate-league-check.ts) to
// hold the product's numbers against. Its only sources are the plan (every game's planned
// score and call-off, the tracked games' plays) and the season's rules as the admin set them
// (the forfeit score, the tiebreakers, what the table ranks by). It imports nothing from the
// product's standings or statistics (packages/sports, packages/core) and reads no stored row,
// so a product that saved or counted a number wrongly cannot make this working-out wrong too.
// The tiebreakers follow the spec's words (P7 §1; T3 "How standings are worked out"): teams
// level on win percentage (or points) go through the tiebreakers in order; a tiebreaker that
// splits a group but leaves some teams level sends those back to the first tiebreaker, among
// themselves only; head-to-head is the table's measure over the games between the level
// teams, passed over unless each of them has played at least one of the others; a coin flip
// is passed over until one is recorded (the simulation records none); teams no tiebreaker
// separates share a place.
import type { SeasonRules } from '@srleagues/contracts';
import type { PlannedGame, SimulationPlan } from './simulate-league-plan.ts';

export type ExpectedRules = Pick<SeasonRules, 'forfeit' | 'tiebreakers' | 'standings'>;

/** A game as the plan says the product must hold it at the end of the season. */
export type ExpectedGame = {
  readonly number: number;
  readonly status: 'final' | 'forfeit' | 'postponed' | 'cancelled';
  /** Null for a game with no result. */
  readonly home: number | null;
  readonly away: number | null;
};

export function expectedGame(game: PlannedGame, rules: ExpectedRules): ExpectedGame {
  const kind = game.callOff?.kind ?? null;
  if (kind === 'postponed-waiting')
    return { number: game.number, status: 'postponed', home: null, away: null };
  if (kind === 'cancelled')
    return { number: game.number, status: 'cancelled', home: null, away: null };
  if (game.callOff?.kind === 'forfeit') {
    const { winnerScore, loserScore } = rules.forfeit;
    const homeForfeits = game.callOff.forfeiting === 'home';
    return {
      number: game.number,
      status: 'forfeit',
      home: homeForfeits ? loserScore : winnerScore,
      away: homeForfeits ? winnerScore : loserScore,
    };
  }
  // Played as planned, put back and played, or corrected: the planned score.
  return { number: game.number, status: 'final', home: game.homeScore, away: game.awayScore };
}

/** Where and when the plan puts a game on the schedule, in the league's own time. */
export type ExpectedPlace = {
  readonly home: string;
  readonly away: string;
  readonly round: number;
  /** yyyy-mm-dd and hh:mm. */
  readonly date: string;
  readonly time: string;
  readonly division: string;
};

/**
 * A game's place on the schedule as the plan gives it. No call-off moves a game: one put back
 * goes back on its planned date (the plan puts it back the same week), the score correction
 * changes no team's side, and one postponed and still waiting keeps the date it had until it
 * is given a new one (the product's postpone command keeps it, shown postponed), so it is held there too.
 */
export function expectedPlace(plan: SimulationPlan, game: PlannedGame): ExpectedPlace {
  return {
    home: game.home,
    away: game.away,
    round: game.round,
    date: game.date,
    time: game.time,
    division: plan.divisions[game.division]?.name ?? 'No division',
  };
}

/** One team's line as the plan's results give it. */
export type ExpectedRow = {
  readonly team: string;
  readonly gamesPlayed: number;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly pointsFor: number;
  readonly pointsAgainst: number;
  /** Standings points in a table ranked by points; null in one ranked by win percentage. */
  readonly points: number | null;
};

export type ExpectedTable = {
  readonly division: number;
  /** Best first; a place of several teams is teams no tiebreaker separates. */
  readonly places: readonly (readonly string[])[];
  readonly rows: ReadonlyMap<string, ExpectedRow>;
  /** Groups level on the table's measure that a tiebreaker put in order. */
  readonly ordered: number;
  /** Groups nothing separates. */
  readonly unseparated: number;
};

type Decided = { home: string; away: string; homeScore: number; awayScore: number };
type Tally = {
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
};
/** A fraction n/d, compared exactly; d is never 0. */
type Fraction = { readonly n: number; readonly d: number };

const empty = (): Tally => ({ wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 });

/** Win percentage, a tie as half a win, 0 with no games; or standings points per game. */
function measureOf(t: Tally, rules: ExpectedRules, perGame: boolean): Fraction {
  const games = t.wins + t.losses + t.ties;
  const s = rules.standings;
  if (s.rankBy === 'points') {
    const points = t.wins * s.pointsPerWin + t.ties * s.pointsPerTie + t.losses * s.pointsPerLoss;
    return perGame && games > 0 ? { n: points, d: games } : { n: points, d: 1 };
  }
  return games === 0 ? { n: 0, d: 1 } : { n: 2 * t.wins + t.ties, d: 2 * games };
}

const compare = (a: Fraction, b: Fraction) => a.n * b.d - b.n * a.d;

/** The group split by a measure, highest first; equal measures stay together. */
function split(group: readonly string[], measure: (team: string) => Fraction): string[][] {
  const sorted = [...group].sort((a, b) => compare(measure(b), measure(a)) || a.localeCompare(b));
  const parts: string[][] = [];
  for (const team of sorted) {
    const last = parts.at(-1);
    if (last !== undefined && compare(measure(last[0]!), measure(team)) === 0) last.push(team);
    else parts.push([team]);
  }
  return parts;
}

/** Every table as the plan's results give it, in the plan's division order. */
export function expectedTables(plan: SimulationPlan, rules: ExpectedRules): ExpectedTable[] {
  const decided: Decided[] = [];
  const tally = new Map<string, Tally>();
  for (const d of plan.divisions) for (const t of d.teams) tally.set(t.name, empty());
  for (const game of plan.games) {
    const want = expectedGame(game, rules);
    if (want.home === null || want.away === null) continue;
    decided.push({ home: game.home, away: game.away, homeScore: want.home, awayScore: want.away });
    const home = tally.get(game.home)!;
    const away = tally.get(game.away)!;
    if (want.status === 'final' || rules.forfeit.countsInPointDifference) {
      home.pointsFor += want.home;
      home.pointsAgainst += want.away;
      away.pointsFor += want.away;
      away.pointsAgainst += want.home;
    }
    if (want.home === want.away) {
      home.ties += 1;
      away.ties += 1;
    } else {
      (want.home > want.away ? home : away).wins += 1;
      (want.home > want.away ? away : home).losses += 1;
    }
  }
  const of = (team: string) => tally.get(team)!;

  /** A tiebreaker's measure over the group, or undefined when it cannot apply. */
  const tiebreaker = (
    name: ExpectedRules['tiebreakers'][number],
    group: readonly string[],
  ): ((team: string) => Fraction) | undefined => {
    if (name === 'point-difference')
      return (team) => ({ n: of(team).pointsFor - of(team).pointsAgainst, d: 1 });
    if (name === 'points-scored') return (team) => ({ n: of(team).pointsFor, d: 1 });
    if (name === 'fewest-points-allowed') return (team) => ({ n: -of(team).pointsAgainst, d: 1 });
    if (name === 'coin-flip') return undefined;
    const members = new Set(group);
    const between = new Map(group.map((team) => [team, empty()]));
    for (const g of decided) {
      if (!members.has(g.home) || !members.has(g.away)) continue;
      const home = between.get(g.home)!;
      const away = between.get(g.away)!;
      if (g.homeScore === g.awayScore) {
        home.ties += 1;
        away.ties += 1;
      } else {
        (g.homeScore > g.awayScore ? home : away).wins += 1;
        (g.homeScore > g.awayScore ? away : home).losses += 1;
      }
    }
    if ([...between.values()].some((t) => t.wins + t.losses + t.ties === 0)) return undefined;
    return (team) => measureOf(between.get(team)!, rules, true);
  };

  let ordered = 0;
  let unseparated = 0;
  const breakTie = (group: readonly string[]): string[][] => {
    for (const name of rules.tiebreakers) {
      const measure = tiebreaker(name, group);
      if (measure === undefined) continue;
      const parts = split(group, measure);
      if (parts.length === 1) continue;
      return parts.flatMap((part) => (part.length === 1 ? [part] : breakTie(part)));
    }
    unseparated += 1;
    return [[...group]];
  };

  return plan.divisions.map((division, index) => {
    const before = { ordered, unseparated };
    const teams = division.teams.map((t) => t.name);
    const places = split(teams, (team) => measureOf(of(team), rules, false)).flatMap((group) => {
      if (group.length === 1) return [group];
      const placed = breakTie(group);
      if (placed.length > 1) ordered += 1;
      return placed;
    });
    const rows = new Map(
      teams.map((team): [string, ExpectedRow] => {
        const t = of(team);
        return [
          team,
          {
            team,
            gamesPlayed: t.wins + t.losses + t.ties,
            ...t,
            points: rules.standings.rankBy === 'points' ? measureOf(t, rules, false).n : null,
          },
        ];
      }),
    );
    return {
      division: index,
      places,
      rows,
      ordered: ordered - before.ordered,
      unseparated: unseparated - before.unseparated,
    };
  });
}

/** One player's line in one tracked game, from the plan's plays. */
export type ExpectedLine = { readonly points: number; readonly fouls: number };

/** A tracked game's lines by side and roster place ("home 0" … "away 4"). */
export function expectedBoxScore(game: PlannedGame): ReadonlyMap<string, ExpectedLine> {
  const lines = new Map<string, { points: number; fouls: number }>();
  const line = (side: string, player: number) => {
    const key = `${side} ${player}`;
    const found = lines.get(key) ?? { points: 0, fouls: 0 };
    lines.set(key, found);
    return found;
  };
  for (const play of game.plays ?? []) {
    if (play.type === 'lineup') for (const p of play.players) line(play.side, p);
    if (play.type === 'score') line(play.side, play.player).points += play.points;
    if (play.type === 'foul') line(play.side, play.player).fouls += 1;
  }
  return lines;
}

/** Each player's season in the statistics: tracked games in the lineup, and points. */
export function expectedPlayerTotals(
  plan: SimulationPlan,
): ReadonlyMap<
  string,
  { readonly team: string; readonly place: number; games: number; points: number }
> {
  const totals = new Map<string, { team: string; place: number; games: number; points: number }>();
  for (const game of plan.games) {
    if (game.plays === null) continue;
    for (const [key, line] of expectedBoxScore(game)) {
      const [side, place] = key.split(' ') as ['home' | 'away', string];
      const team = side === 'home' ? game.home : game.away;
      const id = `${team} #${place}`;
      const found = totals.get(id) ?? { team, place: Number(place), games: 0, points: 0 };
      found.games += 1;
      found.points += line.points;
      totals.set(id, found);
    }
  }
  return totals;
}
