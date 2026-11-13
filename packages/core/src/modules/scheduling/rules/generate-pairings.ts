import type { Pairing, PairingRound, PairingsInput, PairingsResult } from './pairing-types.ts';
import { seededOrder } from './seeded-order.ts';

/**
 * The most times each pair may meet. A guard against a mistyped number producing an
 * enormous schedule, not a league rule: no real season comes near it.
 */
export const maxTimesEachPair = 20;

/**
 * Who plays whom, round by round (P7 §4.2; S-3): every team plays every other team
 * `timesEachPair` times, within its division or across the whole league.
 *
 * Built with the circle method. In each round every team plays at most once; with an odd
 * number of teams one team rests (a bye), and over each full turn every team rests exactly
 * once. Home and away are balanced: within one full turn each team's home and away games
 * differ by at most one and mostly alternate week to week, and every second turn swaps them,
 * so after an even number of turns
 * every team has as many home games as away and every pair has met at each team's home equally.
 *
 * With divisions, each division gets its own rounds and they run side by side. A smaller
 * division needs fewer rounds; its rest weeks are spread through the season, not bunched
 * at the end, and its teams are listed as byes in those rounds.
 *
 * No dates, times or courts here: step 2.73 places the rounds into the season.
 */
export function generatePairings(input: PairingsInput): PairingsResult {
  const { teams, timesEachPair, withinDivisions } = input;
  const arrangement = input.arrangement ?? 0;

  if (!Number.isInteger(timesEachPair) || timesEachPair < 1 || timesEachPair > maxTimesEachPair) {
    return { ok: false, error: { code: 'invalid-times-each-pair', value: timesEachPair } };
  }
  const seen = new Set<string>();
  for (const team of teams) {
    if (seen.has(team.id)) return { ok: false, error: { code: 'duplicate-team', teamId: team.id } };
    seen.add(team.id);
  }

  const groups = new Map<string | null, string[]>();
  for (const team of teams) {
    const key = withinDivisions ? team.divisionId : null;
    const group = groups.get(key) ?? [];
    group.push(team.id);
    groups.set(key, group);
  }
  if (groups.size === 0) {
    return { ok: false, error: { code: 'too-few-teams', divisionId: null, count: 0 } };
  }
  for (const [divisionId, group] of groups) {
    if (group.length < 2) {
      return { ok: false, error: { code: 'too-few-teams', divisionId, count: group.length } };
    }
  }

  const groupRounds = [...groups.values()].map((group, index) =>
    roundRobin(seededOrder(group, arrangement === 0 ? 0 : arrangement + index), timesEachPair),
  );
  const total = Math.max(...groupRounds.map((r) => r.length));
  const games: Pairing[][] = Array.from({ length: total }, () => []);
  for (const rounds of groupRounds) {
    rounds.forEach((round, j) => {
      // Spread a shorter division's rounds evenly through the season.
      games[Math.floor((j * total) / rounds.length)]?.push(...round);
    });
  }

  const order = teams.map((t) => t.id);
  const rounds: PairingRound[] = games.map((round) => {
    const playing = new Set(round.flatMap((g) => [g.homeTeamId, g.awayTeamId]));
    return { games: round, byes: order.filter((id) => !playing.has(id)) };
  });
  return { ok: true, rounds };
}

/**
 * One group's rounds: `times` full turns of the circle method. Positions 0..m-1 sit on a
 * circle (m odd) and the last position is fixed; in round r the fixed position meets r, and
 * r+k meets r-k. A null position is the bye.
 */
function roundRobin(group: readonly string[], times: number): Pairing[][] {
  const positions: (string | null)[] = group.length % 2 === 0 ? [...group] : [...group, null];
  const m = positions.length - 1;
  const fixed = positions[m] ?? null;
  const half = (m - 1) / 2;

  const turn: [string | null, string | null][][] = [];
  for (let r = 0; r < m; r++) {
    // Each pair is written home first. The fixed position alternates home and away by round.
    const round: [string | null, string | null][] = [];
    const onCircle = positions[r] ?? null;
    round.push(r % 2 === 0 ? [onCircle, fixed] : [fixed, onCircle]);
    for (let k = 1; k <= half; k++) {
      const a = (r + k) % m;
      const b = (r - k + m) % m;
      // r+k is home when k is odd. With the fixed position alternating, each team's games
      // alternate home and away with the fewest possible breaks (two in a row): none at all
      // with an odd number of teams, and n-2 in all with an even number.
      const aHome = k % 2 === 1;
      const home = positions[aHome ? a : b] ?? null;
      const away = positions[aHome ? b : a] ?? null;
      round.push([home, away]);
    }
    turn.push(round);
  }

  const out: Pairing[][] = [];
  for (let t = 0; t < times; t++) {
    for (const round of turn) {
      const games: Pairing[] = [];
      for (const [home, away] of round) {
        if (home === null || away === null) continue;
        games.push(
          t % 2 === 0
            ? { homeTeamId: home, awayTeamId: away }
            : { homeTeamId: away, awayTeamId: home },
        );
      }
      out.push(games);
    }
  }
  return out;
}
