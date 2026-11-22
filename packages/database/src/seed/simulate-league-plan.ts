// Development-only (T-195, T-201), step 2.236: the plan of a made-up league of any size and
// its whole season, worked out from a seed and nothing else, so the same seed always gives
// the same league. Pure: no database, no clock, no randomness but the seeded one.
//
// From {teams, divisions, rounds, tracked, seed} it makes:
// - invented names only, built from step 2.59's invented school, road and surname lists
//   (demo-league-data.ts), never a real person, school or place;
// - each division's schedule as a round robin (the circle method), one game day a round,
//   so no team plays twice on a day, the round robin starting again when it runs out with
//   home and away turned about, and every team about as often home as away;
// - each team's strength: in every division one clearly strongest, one clearly weakest,
//   the rest spread between, so the tables look like a season;
// - each game's result, drawn from the two strengths with a small edge for the home side,
//   never a tie; and, for the `tracked` games, the plays a scorer would tap to reach it.
import { demoLeague } from './demo-league-data.ts';

export type SimulationOptions = {
  readonly teams: number;
  readonly divisions: number;
  readonly rounds: number;
  readonly tracked: number;
  readonly seed: number;
};

/** Small, so the command at its defaults takes seconds. */
export const simulationDefaults: SimulationOptions = {
  teams: 4,
  divisions: 1,
  rounds: 6,
  tracked: 2,
  seed: 1,
};

/** The players each team's roster holds: a lineup of five, as the tracker puts on court. */
export const playersPerTeam = 5;

export type PlannedPlayer = {
  readonly firstName: string;
  readonly lastName: string;
  readonly jersey: string;
};

export type PlannedTeam = {
  readonly name: string;
  readonly shortName: string;
  readonly color: string;
  readonly venue: { readonly name: string; readonly address: string };
  readonly strength: number;
  readonly players: readonly PlannedPlayer[];
};

export type PlannedDivision = { readonly name: string; readonly teams: readonly PlannedTeam[] };

type Side = 'home' | 'away';

/** A tracker action, as seed-tracked-games.ts sends them, naming players by roster place. */
export type PlannedPlay =
  | { readonly type: 'lineup'; readonly side: Side; readonly players: readonly number[] }
  | {
      readonly type: 'score';
      readonly side: Side;
      readonly player: number;
      readonly points: 1 | 2 | 3;
    }
  | { readonly type: 'foul'; readonly side: Side; readonly player: number }
  | { readonly type: 'period'; readonly period: number }
  | { readonly type: 'start' | 'pause' | 'end' };

export type PlannedGame = {
  readonly number: number;
  readonly round: number;
  readonly date: string;
  readonly time: string;
  readonly division: number;
  /** Team names, as the fixtures file names them. */
  readonly home: string;
  readonly away: string;
  readonly homeScore: number;
  readonly awayScore: number;
  /** Plays for a game scored through the tracker; null for one entered as a final score. */
  readonly plays: readonly PlannedPlay[] | null;
  /** For a tracked game: level at the end of regulation, won in one overtime period. */
  readonly overtime: boolean;
  /** What a real season does to this game besides playing it (part 2); null for nothing. */
  readonly callOff: CallOff | null;
};

/**
 * The games a real season loses or changes, each done through the product's own command:
 * postponed then put back on its date and played; postponed and left waiting; cancelled;
 * cancelled then put back and played; forfeited (the league's forfeit score); and a final
 * score first entered wrongly (`first`), reopened with a reason and corrected.
 */
export type CallOff =
  | {
      readonly kind:
        | 'postponed-then-played'
        | 'postponed-waiting'
        | 'cancelled'
        | 'cancelled-then-played';
    }
  | { readonly kind: 'forfeit'; readonly forfeiting: Side }
  | {
      readonly kind: 'corrected';
      readonly first: { readonly home: number; readonly away: number };
    };

export const callOffKinds = [
  'postponed-then-played',
  'postponed-waiting',
  'cancelled',
  'cancelled-then-played',
  'forfeit',
  'corrected',
] as const satisfies readonly CallOff['kind'][];

/** A called-off game the season never plays: it counts in no table and no games played. */
export const neverPlayed = (callOff: CallOff | null): boolean =>
  callOff?.kind === 'postponed-waiting' || callOff?.kind === 'cancelled';

/** Games of each kind called off: none under 12 games, then 1 for every 60 games, at least 1. */
export function callOffsOfEachKind(games: number): number {
  return games < 12 ? 0 : Math.max(1, Math.floor(games / 60));
}

export type SimulationPlan = {
  readonly options: SimulationOptions;
  readonly slug: string;
  readonly name: string;
  readonly timeZone: string;
  readonly season: { readonly slug: string; readonly name: string };
  readonly divisions: readonly PlannedDivision[];
  readonly games: readonly PlannedGame[];
};

/** Why options cannot make a league, in a sentence; null when they can. */
export function simulationProblem(o: SimulationOptions): string | null {
  const whole = (n: number) => Number.isInteger(n) && n >= 0;
  if (![o.teams, o.divisions, o.rounds, o.tracked, o.seed].every(whole)) {
    return 'Every number must be a whole number, 0 or more.';
  }
  if (o.divisions < 1) return 'A league needs at least 1 division.';
  if (o.teams < 2 * o.divisions) return 'Each division needs at least 2 teams.';
  if (o.teams > 600) return 'At most 600 teams.';
  if (o.rounds < 1 || o.rounds > 200) return 'Between 1 and 200 rounds.';
  return null;
}

/** A small seeded generator (mulberry32): the same seed, the same numbers. */
function generator(seed: number): () => number {
  let state = (seed * 2654435761) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const demoTeams = demoLeague.divisions.flatMap((d) => d.teams);
/** The invented school words: the first word of each of step 2.59's schools. */
const schoolWords = demoTeams.map((t) => t.name.split(' ')[0]!);
const schoolKinds = ['Charter', 'Prep', 'Academy', 'Collegiate', 'STEM'];
/** The invented road words of step 2.59's addresses. */
const roadWords = [...new Set(demoTeams.map((t) => t.venue.address.split(' ')[1]!))];
const colors = demoTeams.map((t) => t.color);
/** First names as plain as step 2.59's (Kit, Flynn, Parker), with invented surnames. */
const firstNames = [
  ...['Kit', 'Flynn', 'Parker', 'Rowan', 'Sage', 'Quinn', 'Ellis', 'Remy', 'Arden', 'Blair'],
  ...['Corin', 'Dale', 'Emery', 'Finch', 'Hollis', 'Jules', 'Lane', 'Marlo', 'Noel', 'Tobin'],
];
const surnames = demoLeague.madeUpSurnames;
const romans = ['', ' II', ' III', ' IV', ' V', ' VI'];

/** Team n's name: each school word with each kind of school, then numbered on. */
function teamName(n: number, words: readonly string[]): string {
  const base = n % words.length;
  const pass = Math.floor(n / words.length);
  const kind = schoolKinds[(base + pass) % schoolKinds.length]!;
  const numbered = romans[Math.floor(pass / schoolKinds.length)] ?? ` ${pass}`;
  return `${words[base]!} ${kind}${numbered}`;
}

function slugOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** yyyy-mm-dd, `days` days on from `day`. */
function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** In a division of n: one at the top, one at the bottom, the rest spread between. */
function strengths(n: number, random: () => number): number[] {
  const middle = Array.from({ length: n - 2 }, (_, k) => {
    const spread = n === 3 ? 0 : -0.45 + (0.9 * k) / (n - 3);
    return Math.round((spread + (random() - 0.5) * 0.1) * 100) / 100;
  });
  return shuffled([1.5, ...middle, -1.5], random);
}

/**
 * The games of each round of a round robin (the circle method), as [home, away] by team
 * place. With an odd number of teams the bye (-1) holds the place that never turns, so
 * the team drawn against it sits out. The fixed place is home in every other round and
 * the other pairs alternate by their place, which keeps every team within one game of as
 * many home as away games at the end of each pass, and within two in between.
 */
function roundRobin(n: number): (readonly [number, number])[][] {
  const others = Array.from({ length: n }, (_, k) => k);
  const places = n % 2 === 1 ? [-1, ...others] : others;
  const count = places.length;
  const rounds: (readonly [number, number])[][] = [];
  for (let r = 0; r < count - 1; r += 1) {
    const pairs: (readonly [number, number])[] = [];
    for (let i = 0; i < count / 2; i += 1) {
      const a = places[i]!;
      const b = places[count - 1 - i]!;
      const aHome = i === 0 ? r % 2 === 0 : i % 2 === 1;
      if (a !== -1 && b !== -1) pairs.push(aHome ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    places.splice(1, 0, places.pop()!);
  }
  return rounds;
}

/** A team's points: its strength against the other's, the home edge, and the day's luck. */
function points(own: number, other: number, home: boolean, random: () => number): number {
  const luck = (random() + random() + random() - 1.5) * 12;
  return Math.max(20, Math.round(52 + 6 * (own - other) + (home ? 1.5 : -1.5) + luck));
}

/** Points made as baskets (some 3s, some free throws, the rest 2s), each by a player. */
function baskets(total: number, side: Side, random: () => number): PlannedPlay[] {
  const threes = Math.floor(total / 10);
  const rest = total - 3 * threes;
  const ones = Math.min(rest, (rest % 2) + 2 * Math.floor(random() * 3));
  const made: (1 | 2 | 3)[] = [
    ...Array<3>(threes).fill(3),
    ...Array<1>(ones).fill(1),
    ...Array<2>((rest - ones) / 2).fill(2),
  ];
  // The first players on the roster score more, as a team's best do.
  const weights = [5, 4, 3, 2, 1];
  const sum = weights.reduce((a, b) => a + b, 0);
  return made.map((value) => {
    let pick = random() * sum;
    let player = 0;
    while (player < weights.length - 1 && pick >= weights[player]!) {
      pick -= weights[player]!;
      player += 1;
    }
    return { type: 'score', side, player, points: value };
  });
}

/** The plays of a tracked game: lineups, four periods of baskets and a foul a side, End. */
export function plannedPlays(
  home: number,
  away: number,
  random: () => number,
  overtime = false,
): PlannedPlay[] {
  // An overtime game: level at the lower score after four periods, the rest in a fifth.
  const level = Math.min(home, away);
  const regulation = overtime ? { home: level, away: level } : { home, away };
  const all = shuffled(
    [...baskets(regulation.home, 'home', random), ...baskets(regulation.away, 'away', random)],
    random,
  );
  const lineup = Array.from({ length: playersPerTeam }, (_, k) => k);
  const plays: PlannedPlay[] = [
    { type: 'lineup', side: 'home', players: lineup },
    { type: 'lineup', side: 'away', players: lineup },
  ];
  const periods = 4;
  for (let p = 1; p <= periods; p += 1) {
    if (p > 1) plays.push({ type: 'period', period: p });
    plays.push({ type: 'start' });
    const from = Math.floor(((p - 1) * all.length) / periods);
    const to = Math.floor((p * all.length) / periods);
    plays.push(...all.slice(from, to));
    // A foul stops the clock on the high-school rules, so the period ends on the fouls.
    plays.push({ type: 'foul', side: 'home', player: p % playersPerTeam });
    plays.push({ type: 'foul', side: 'away', player: (p + 2) % playersPerTeam });
  }
  if (overtime) {
    const winner: Side = home > away ? 'home' : 'away';
    plays.push({ type: 'period', period: periods + 1 }, { type: 'start' });
    plays.push(...baskets(Math.abs(home - away), winner, random));
    plays.push(
      { type: 'foul', side: 'home', player: 0 },
      { type: 'foul', side: 'away', player: 1 },
    );
  }
  plays.push({ type: 'end' });
  return plays;
}

/** The whole plan, from the options alone (above). */
export function planSimulation(options: SimulationOptions): SimulationPlan {
  const problem = simulationProblem(options);
  if (problem !== null) throw new Error(problem);
  const random = generator(options.seed);
  const words = shuffled(schoolWords, random);
  const roads = shuffled(roadWords, random);
  let person = 0;
  const made = Array.from({ length: options.teams }, (_, n) => {
    const name = teamName(n, words);
    const players = Array.from({ length: playersPerTeam }, (_, k) => {
      const at = person;
      person += 1;
      return {
        firstName: firstNames[at % firstNames.length]!,
        lastName: surnames[Math.floor(at / firstNames.length) % surnames.length]!,
        jersey: String(3 + 2 * k),
      };
    });
    return {
      name,
      shortName: slugOf(name),
      color: colors[n % colors.length]!,
      venue: { name: `${name} Gym`, address: `${100 + 7 * n} ${roads[n % roads.length]!} Road` },
      players,
    };
  });
  // Team n goes to division n mod d, so the divisions differ in size by at most one.
  const divisions: PlannedDivision[] = Array.from({ length: options.divisions }, (_, d) => {
    const teams = made.filter((_, n) => n % options.divisions === d);
    const strong = strengths(teams.length, random);
    return {
      name: `Division ${d + 1}`,
      teams: teams.map((team, k) => ({ ...team, strength: strong[k]! })),
    };
  });

  const firstDay = '2025-11-07';
  const planned: Omit<PlannedGame, 'plays' | 'number' | 'overtime' | 'callOff'>[] = [];
  for (const [d, division] of divisions.entries()) {
    const robin = roundRobin(division.teams.length);
    for (let r = 0; r < options.rounds; r += 1) {
      // Each pass of the round robin turns home and away about from the one before.
      const turned = Math.floor(r / robin.length) % 2 === 1;
      for (const [k, [a, b]] of robin[r % robin.length]!.entries()) {
        const [h, v] = turned ? [b, a] : [a, b];
        const ht = division.teams[h]!;
        const vt = division.teams[v]!;
        let homeScore = points(ht.strength, vt.strength, true, random);
        let awayScore = points(vt.strength, ht.strength, false, random);
        // No ties: a level game goes to overtime, and one side wins it.
        if (homeScore === awayScore) {
          if (random() < 0.5) homeScore += 2;
          else awayScore += 2;
        }
        planned.push({
          round: r + 1,
          date: addDays(firstDay, 7 * r),
          time: k % 2 === 0 ? '18:00' : '19:30',
          division: d,
          home: ht.name,
          away: vt.name,
          homeScore,
          awayScore,
        });
      }
    }
  }
  planned.sort((x, y) => x.round - y.round || x.division - y.division);
  // The tracked games are spread across the season, evenly.
  const tracked = new Set(
    Array.from({ length: Math.min(options.tracked, planned.length) }, (_, j) =>
      Math.floor(((j + 0.5) * planned.length) / Math.min(options.tracked, planned.length)),
    ),
  );
  // Part 2: the first tracked game of a league of 12 games or more goes to overtime, and a
  // small share of the other games is called off. Their own seeded generator, so the
  // league, its results and its plays are those part 1 made from the same seed.
  const firstTracked = Math.min(...tracked);
  const overtimeAt = planned.length >= 12 && tracked.size > 0 ? firstTracked : -1;
  const callOffs = new Map<number, CallOff>();
  const offRandom = generator(options.seed + 0x2236);
  const open = shuffled(
    planned.map((_, n) => n).filter((n) => !tracked.has(n)),
    offRandom,
  );
  const each = callOffsOfEachKind(planned.length);
  for (const kind of callOffKinds) {
    for (let k = 0; k < each && open.length > 0; k += 1) {
      const n = open.pop()!;
      const game = planned[n]!;
      callOffs.set(
        n,
        kind === 'forfeit'
          ? // The side that would have lost does not come.
            { kind, forfeiting: game.homeScore < game.awayScore ? 'home' : 'away' }
          : kind === 'corrected'
            ? // Typed the wrong way round, so the wrong side had won.
              { kind, first: { home: game.awayScore, away: game.homeScore } }
            : { kind },
      );
    }
  }
  // An overtime period is short: the overtime game is won by at most 6 points.
  const close = (game: (typeof planned)[number]) => {
    const level = Math.min(game.homeScore, game.awayScore);
    const margin = Math.min(6, Math.abs(game.homeScore - game.awayScore));
    return game.homeScore > game.awayScore
      ? { ...game, homeScore: level + margin }
      : { ...game, awayScore: level + margin };
  };
  const games = planned
    .map((plain, n) => (n === overtimeAt ? close(plain) : plain))
    .map((game, n) => ({
      ...game,
      number: 1001 + n,
      plays: tracked.has(n)
        ? plannedPlays(game.homeScore, game.awayScore, random, n === overtimeAt)
        : null,
      overtime: n === overtimeAt,
      callOff: callOffs.get(n) ?? null,
    }));
  return {
    options,
    slug: 'simulated',
    name: 'Simulated Made-up League',
    timeZone: 'America/Chicago',
    season: { slug: '2025-26', name: '2025–26' },
    divisions,
    games,
  };
}

/** The plan's games as a fixtures file the product's own import reads, with no scores. */
export function fixturesFileOf(plan: SimulationPlan): string {
  const venueOf = new Map(
    plan.divisions.flatMap((d) => d.teams.map((t) => [t.name, t.venue.name])),
  );
  const lines = plan.games.map((g) =>
    [
      g.number,
      `Round ${g.round}`,
      g.date,
      g.time,
      g.home,
      g.away,
      venueOf.get(g.home),
      '',
      '',
    ].join(','),
  );
  return ['Game number,Round,Date,Time,Home,Away,Venue,Home score,Away score', ...lines, ''].join(
    '\n',
  );
}
