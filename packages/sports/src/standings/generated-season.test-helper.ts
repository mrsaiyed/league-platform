// Made-up seasons for the generated-input tests (T-182). A small seeded random
// source, so a failing case can be run again from its seed.
import type {
  CoinFlip,
  GameStatus,
  StandingsAdjustment,
  StandingsGame,
  StandingsInput,
  StandingsRules,
  StandingsTeam,
  Tiebreaker,
} from './types.ts';

export interface Random {
  /** 0 up to but not including `below`. */
  int(below: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
}

/** mulberry32: tiny, fast and the same on every machine. */
export function seeded(seed: number): Random {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (below: number): number => Math.floor(next() * below);
  return {
    int,
    pick: <T>(items: readonly T[]): T => {
      const item = items[int(items.length)];
      if (item === undefined) throw new Error('pick from an empty list');
      return item;
    },
    shuffle: <T>(items: readonly T[]): T[] => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        const a = out[i];
        const b = out[j];
        if (a === undefined || b === undefined) continue;
        out[i] = b;
        out[j] = a;
      }
      return out;
    },
  };
}

const allTiebreakers: readonly Tiebreaker[] = [
  'head-to-head',
  'point-difference',
  'points-scored',
  'fewest-points-allowed',
  'coin-flip',
];

export const notCountedStatuses: readonly GameStatus[] = [
  'scheduled',
  'live',
  'postponed',
  'cancelled',
];

function rulesFor(random: Random): StandingsRules {
  const tiebreakers = random
    .shuffle(allTiebreakers)
    .slice(0, random.int(allTiebreakers.length + 1));
  return {
    standings: {
      rankBy: random.int(2) === 0 ? 'win-percentage' : 'points',
      pointsPerWin: random.pick([2, 3]),
      pointsPerTie: random.pick([0, 1]),
      pointsPerLoss: random.pick([0, 1]),
    },
    tiebreakers,
    allowTies: random.int(2) === 0,
    forfeit: {
      winnerScore: random.pick([1, 2, 20]),
      loserScore: 0,
      countsInPointDifference: random.int(2) === 0,
    },
  };
}

/**
 * A season of 2 to 9 teams in up to 3 divisions. Scores are kept low and close so
 * that ties in the table, and ties that need several tiebreakers, are common.
 */
export function generatedSeason(random: Random): StandingsInput {
  const divisionCount = random.int(4);
  const teams: StandingsTeam[] = [];
  const teamCount = 2 + random.int(8);
  for (let i = 0; i < teamCount; i++) {
    teams.push({
      teamId: `t${i}`,
      divisionId: divisionCount === 0 ? null : `d${random.int(divisionCount)}`,
    });
  }

  const games: StandingsGame[] = [];
  const gameCount = random.int(teamCount * 4);
  for (let i = 0; i < gameCount; i++) {
    const home = random.pick(teams).teamId;
    let away = random.pick(teams).teamId;
    if (away === home) away = teams[(Number(home.slice(1)) + 1) % teams.length]?.teamId ?? home;
    const roll = random.int(10);
    const status: GameStatus =
      roll < 7 ? 'final' : roll < 8 ? 'forfeit' : random.pick(notCountedStatuses);
    const scored = status === 'final' || status === 'forfeit';
    games.push({
      gameId: `g${i}`,
      status,
      homeTeamId: home,
      awayTeamId: away,
      homeScore: scored ? random.int(4) : null,
      awayScore: scored ? random.int(4) : null,
      winnerTeamId: status === 'forfeit' ? random.pick([home, away]) : null,
      // Few distinct days, so games on the same day are ordered by id.
      startsAt: new Date(Date.UTC(2026, 0, 1 + random.int(10))).toISOString(),
    });
  }

  const adjustments: StandingsAdjustment[] = [];
  for (let i = random.int(5); i > 0; i--) {
    adjustments.push({
      adjustmentId: `adj${i}`,
      teamId: random.pick(teams).teamId,
      // From -1 to 1 each, so some would take a count below zero and are left out.
      wins: random.int(3) - 1,
      losses: random.int(3) - 1,
      ties: random.int(3) - 1,
      points: -random.int(3),
      reason: `Reason ${i}`,
    });
  }

  const coinFlips: CoinFlip[] = [];
  for (let i = random.int(3); i > 0; i--) {
    coinFlips.push(
      random.shuffle(teams.map((team) => team.teamId)).slice(0, 2 + random.int(teamCount - 1)),
    );
  }

  return { teams, games, rules: rulesFor(random), adjustments, coinFlips };
}
