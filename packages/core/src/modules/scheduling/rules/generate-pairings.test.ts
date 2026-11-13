import { describe, expect, it } from 'vitest';
import { generatePairings, maxTimesEachPair } from './generate-pairings.ts';
import type { PairingRound, PairingTeam, PairingsInput } from './pairing-types.ts';
import { randomFrom, randomTeams, teamsOf } from './pairings.test-helper.ts';

/** Rounds written as text: "avd bvc" is a at home to d and b at home to c; "/e" is e's bye. */
function shown(rounds: readonly PairingRound[]): string[] {
  return rounds.map((r) =>
    [...r.games.map((g) => `${g.homeTeamId}v${g.awayTeamId}`), ...r.byes.map((b) => `/${b}`)].join(
      ' ',
    ),
  );
}

function pairings(input: PairingsInput): PairingRound[] {
  const result = generatePairings(input);
  if (!result.ok) throw new Error(`no pairings: ${JSON.stringify(result.error)}`);
  return result.rounds;
}

const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

describe('generatePairings, worked examples (P7 §4.2; S-3)', () => {
  it('pairs four teams once each in three rounds, home and away within one of each other', () => {
    const rounds = pairings({ teams: teamsOf('abcd'), timesEachPair: 1, withinDivisions: false });
    expect(shown(rounds)).toEqual(['avd bvc', 'dvb cva', 'cvd avb']);
  });

  it('gives three teams a bye each, and swaps home and away the second time round', () => {
    const rounds = pairings({ teams: teamsOf('abc'), timesEachPair: 2, withinDivisions: false });
    expect(shown(rounds)).toEqual(['bvc /a', 'cva /b', 'avb /c', 'cvb /a', 'avc /b', 'bva /c']);
  });

  it('alternates home and away for five teams, one bye each', () => {
    const rounds = pairings({ teams: teamsOf('abcde'), timesEachPair: 1, withinDivisions: false });
    expect(shown(rounds)).toEqual([
      'bve dvc /a',
      'cva evd /b',
      'dvb ave /c',
      'evc bva /d',
      'avd cvb /e',
    ]);
  });

  it('keeps games within divisions, spreading a smaller division across the season', () => {
    const teams = [...teamsOf('abcd', 'north'), ...teamsOf('xy', 'south')];
    const rounds = pairings({ teams, timesEachPair: 1, withinDivisions: true });
    expect(shown(rounds)).toEqual(['avd bvc xvy', 'dvb cva /x /y', 'cvd avb /x /y']);

    const twice = pairings({ teams, timesEachPair: 2, withinDivisions: true });
    expect(shown(twice).map((r) => r.includes('xvy') || r.includes('yvx'))).toEqual([
      true,
      false,
      false,
      true,
      false,
      false,
    ]);
  });

  it('pairs across divisions when the rule allows it', () => {
    const teams = [...teamsOf('ab', 'north'), ...teamsOf('cd', 'south')];
    const rounds = pairings({ teams, timesEachPair: 1, withinDivisions: false });
    expect(rounds.flatMap((r) => r.games)).toHaveLength(6);
  });

  it('gives another arrangement for another number, and the same one for the same number', () => {
    const input = { teams: teamsOf('abcdefgh'), timesEachPair: 1, withinDivisions: false };
    const first = shown(pairings({ ...input, arrangement: 3 }));
    expect(shown(pairings({ ...input, arrangement: 3 }))).toEqual(first);
    expect(shown(pairings({ ...input, arrangement: 4 }))).not.toEqual(first);
    expect(shown(pairings({ ...input, arrangement: 0 }))).toEqual(shown(pairings(input)));
  });

  it('refuses what cannot be paired', () => {
    const base = { teams: teamsOf('abcd'), withinDivisions: false };
    for (const value of [0, -1, 1.5, Number.NaN, maxTimesEachPair + 1]) {
      expect(generatePairings({ ...base, timesEachPair: value })).toEqual({
        ok: false,
        error: { code: 'invalid-times-each-pair', value },
      });
    }
    expect(generatePairings({ ...base, timesEachPair: maxTimesEachPair }).ok).toBe(true);
    expect(
      generatePairings({ teams: teamsOf('aba'), timesEachPair: 1, withinDivisions: false }),
    ).toEqual({ ok: false, error: { code: 'duplicate-team', teamId: 'a' } });
    expect(generatePairings({ teams: [], timesEachPair: 1, withinDivisions: false })).toEqual({
      ok: false,
      error: { code: 'too-few-teams', divisionId: null, count: 0 },
    });
    expect(
      generatePairings({ teams: teamsOf('a'), timesEachPair: 1, withinDivisions: false }),
    ).toEqual({ ok: false, error: { code: 'too-few-teams', divisionId: null, count: 1 } });
    const lonely = [...teamsOf('abc', 'north'), ...teamsOf('z', 'south')];
    expect(generatePairings({ teams: lonely, timesEachPair: 1, withinDivisions: true })).toEqual({
      ok: false,
      error: { code: 'too-few-teams', divisionId: 'south', count: 1 },
    });
    expect(generatePairings({ teams: lonely, timesEachPair: 1, withinDivisions: false }).ok).toBe(
      true,
    );
  });
});

describe('generatePairings, generated inputs (T-182)', () => {
  const cases = Array.from({ length: 300 }, (_, i) => i + 1);

  it.each(cases)('meets every rule for made-up league %i', (seed) => {
    const teams = randomTeams(seed);
    const random = randomFrom(seed * 7919);
    const timesEachPair = random.int(4) + 1;
    const withinDivisions = random.chance();
    const arrangement = random.int(3) === 0 ? 0 : random.int(1000) + 1;
    const input = { teams, timesEachPair, withinDivisions, arrangement };
    const result = generatePairings(input);

    const groups = new Map<string | null, PairingTeam[]>();
    for (const team of teams) {
      const key = withinDivisions ? team.divisionId : null;
      groups.set(key, [...(groups.get(key) ?? []), team]);
    }
    const smallest = Math.min(...[...groups.values()].map((g) => g.length));
    if (teams.length === 0 || smallest < 2) {
      expect(result).toMatchObject({ ok: false, error: { code: 'too-few-teams' } });
      return;
    }
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const { rounds } = result;

    // The same inputs always give the same pairings.
    expect(generatePairings(input)).toEqual(result);

    // Problems are collected and compared once, so a large league stays quick to check.
    const problems: string[] = [];
    const groupOf = new Map(teams.map((t) => [t.id, withinDivisions ? t.divisionId : null]));
    const met = new Map<string, number>();
    const hosted = new Map<string, number>();
    const played = new Map<string, number>();
    const home = new Map<string, number>();
    const add = (map: Map<string, number>, key: string): void => {
      map.set(key, (map.get(key) ?? 0) + 1);
    };
    for (const g of rounds.flatMap((r) => r.games)) {
      if (groupOf.get(g.homeTeamId) !== groupOf.get(g.awayTeamId)) {
        problems.push(`cross-division ${g.homeTeamId} v ${g.awayTeamId}`);
      }
      if (g.homeTeamId === g.awayTeamId) problems.push(`${g.homeTeamId} plays itself`);
      add(met, pairKey(g.homeTeamId, g.awayTeamId));
      add(hosted, `${g.homeTeamId}>${g.awayTeamId}`);
      add(played, g.homeTeamId);
      add(played, g.awayTeamId);
      add(home, g.homeTeamId);
    }

    // Every pair the rules allow meets exactly the chosen number of times, and no other pair
    // meets. Each team of the pair is at home within one of the other, and every team's home
    // and away games are within one of each other: exactly even with an even number of turns.
    let pairs = 0;
    for (const group of groups.values()) {
      for (const [i, a] of group.entries()) {
        const games = played.get(a.id) ?? 0;
        const atHome = home.get(a.id) ?? 0;
        if (games !== (group.length - 1) * timesEachPair) problems.push(`${a.id} plays ${games}`);
        if (Math.abs(2 * atHome - games) > (timesEachPair % 2 === 0 ? 0 : 1)) {
          problems.push(`${a.id} home ${atHome} of ${games}`);
        }
        for (const b of group.slice(i + 1)) {
          pairs++;
          const times = met.get(pairKey(a.id, b.id)) ?? 0;
          if (times !== timesEachPair) problems.push(`${a.id} and ${b.id} meet ${times} times`);
          const aHosts = hosted.get(`${a.id}>${b.id}`) ?? 0;
          if (Math.abs(2 * aHosts - times) > 1)
            problems.push(`${a.id} hosts ${b.id} ${aHosts} times`);
        }
      }
    }
    if (met.size !== pairs) problems.push(`${met.size} pairs meet, ${pairs} expected`);

    // As many rounds as the largest group needs.
    const roundsNeeded = (size: number): number =>
      (size % 2 === 0 ? size - 1 : size) * timesEachPair;
    const needed = Math.max(...[...groups.values()].map((g) => roundsNeeded(g.length)));
    if (rounds.length !== needed) problems.push(`${rounds.length} rounds, ${needed} needed`);

    // In each round every team either plays once or has a bye.
    const everyone = teams.map((t) => t.id).sort();
    rounds.forEach((round, i) => {
      const playing = round.games.flatMap((g) => [g.homeTeamId, g.awayTeamId]);
      const all = [...playing, ...round.byes].sort();
      if (all.join() !== everyone.join())
        problems.push(`round ${i + 1} does not hold every team once`);
    });

    // No pair meets two rounds running, unless their group has only those two teams.
    for (let i = 1; i < rounds.length; i++) {
      const before = new Set(
        (rounds[i - 1]?.games ?? []).map((g) => pairKey(g.homeTeamId, g.awayTeamId)),
      );
      for (const g of rounds[i]?.games ?? []) {
        const size = groups.get(groupOf.get(g.homeTeamId) ?? null)?.length;
        if (before.has(pairKey(g.homeTeamId, g.awayTeamId)) && size !== 2) {
          problems.push(`${g.homeTeamId} and ${g.awayTeamId} meet in rounds ${i} and ${i + 1}`);
        }
      }
    }

    expect(problems).toEqual([]);
  });
});
