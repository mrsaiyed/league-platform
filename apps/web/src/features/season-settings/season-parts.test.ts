// Season settings' parts (step 2.47): each part's form shows the season's rules and gives
// back the rules with only that part changed; a box the rules refuse is named, never
// saved; nothing the product does not follow is offered or lost.
import {
  defaultSeasonRules,
  seasonRulesPreset,
  teamFoulsCounted,
  type SeasonRules,
} from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import {
  columnField,
  nameFromPart,
  presetOf,
  rulesFields,
  rulesFromPart,
  ticked,
  withPreset,
} from './season-parts.ts';

const base = defaultSeasonRules();
const saved = (reading: ReturnType<typeof rulesFromPart>): SeasonRules => {
  if (!reading.ok) throw new Error(`refused: ${JSON.stringify(reading.wrong)}`);
  return reading.value;
};
const wrongOf = (reading: ReturnType<typeof rulesFromPart>) =>
  reading.ok ? [] : reading.wrong.map((w) => `${w.field}:${w.why}`);

describe('each part shows the rules and gives them back unchanged', () => {
  for (const part of ['game', 'recording', 'standings', 'rosters'] as const) {
    it(`${part}, from the starting rules and from the high-school preset`, () => {
      for (const rules of [base, seasonRulesPreset('high-school')]) {
        expect(saved(rulesFromPart(part, rules, rulesFields(part, rules)))).toEqual(rules);
      }
    });
  }
});

describe('a part changes only its own rules', () => {
  it('the standings part: tiebreakers in the order of their boxes, empty ones left out', () => {
    const fields = {
      ...rulesFields('standings', base),
      tiebreaker1: 'points-scored',
      tiebreaker2: '',
      tiebreaker3: 'head-to-head',
      tiebreaker4: '',
    };
    const rules = saved(rulesFromPart('standings', base, fields));
    expect(rules.tiebreakers).toEqual(['points-scored', 'head-to-head']);
    expect({ ...rules, tiebreakers: base.tiebreakers, standings: base.standings }).toEqual(base);
  });

  it('keeps a coin flip the season already has, last, though it is not offered', () => {
    const withCoin = { ...base, tiebreakers: ['head-to-head' as const, 'coin-flip' as const] };
    const fields = rulesFields('standings', withCoin);
    expect(Object.values(fields)).not.toContain('coin-flip');
    expect(saved(rulesFromPart('standings', withCoin, fields)).tiebreakers).toEqual([
      'head-to-head',
      'coin-flip',
    ]);
  });

  it('names a tiebreaker chosen twice, and saves nothing', () => {
    const fields = {
      ...rulesFields('standings', base),
      tiebreaker1: 'point-difference',
      tiebreaker2: 'point-difference',
    };
    expect(wrongOf(rulesFromPart('standings', base, fields))).toEqual([
      'tiebreaker2:tiebreakerTwice',
    ]);
  });

  it('draws the columns ticked, and refuses a points table without the points column', () => {
    const fields = { ...rulesFields('standings', base), rankBy: 'points' };
    expect(wrongOf(rulesFromPart('standings', base, fields))).toEqual(['columns:pointsColumn']);
    // T-290: and the points column in a table ranked by win percentage.
    const unranked = { ...rulesFields('standings', base), [columnField('points')]: ticked };
    expect(wrongOf(rulesFromPart('standings', base, unranked))).toEqual([
      'columns:pointsColumnUnranked',
    ]);
    const withPoints = { ...fields, [columnField('points')]: ticked };
    expect(saved(rulesFromPart('standings', base, withPoints)).standings.columns).toContain(
      'points',
    );
    const none = Object.fromEntries(
      Object.entries(fields).filter(([name]) => !name.startsWith('column-')),
    );
    expect(wrongOf(rulesFromPart('standings', base, none))).toEqual(['columns:noColumns']);
  });

  it('refuses a forfeit winner who does not score more, by its box', () => {
    const fields = { ...rulesFields('standings', base), forfeitWinner: '0', forfeitLoser: '0' };
    expect(wrongOf(rulesFromPart('standings', base, fields))).toEqual([
      'forfeitWinner:forfeitWinnerMore',
    ]);
  });

  it('refuses a box that is not a number in its limits, and an empty box that must hold one', () => {
    const fields = { ...rulesFields('game', base), bonusFouls: '7x', fullTimeouts: '' };
    expect(wrongOf(rulesFromPart('game', base, fields))).toEqual([
      'bonusFouls:number',
      'fullTimeouts:number',
    ]);
    expect(
      wrongOf(rulesFromPart('game', base, { ...rulesFields('game', base), periodMinutes: '61' })),
    ).toEqual(['periodMinutes:minutes']);
  });

  it('takes an empty box as "none" where it may be: no double bonus, no foul limit', () => {
    const fields = { ...rulesFields('game', base), doubleBonusFouls: '', playerFoulLimit: '' };
    const rules = saved(rulesFromPart('game', base, fields));
    expect(rules.fouls.doubleBonusFouls).toBeNull();
    expect(rules.fouls.playerFoulLimit).toBeNull();
  });

  it('keeps only the clock extra the chosen clock uses', () => {
    const running = {
      ...rulesFields('game', base),
      clockMode: 'running',
      lastMinutes: '2',
      stopClockScope: 'game',
      mercyLead: '20',
    };
    expect(saved(rulesFromPart('game', base, running)).clock).toEqual({
      mode: 'running',
      stopClockLastSeconds: 120,
      stopClockScope: 'game',
      mercyLead: null,
    });
    expect(saved(rulesFromPart('game', base, { ...running, clockMode: 'stop' })).clock).toEqual({
      mode: 'stop',
      stopClockLastSeconds: null,
      mercyLead: 20,
    });
  });

  it('refuses live tracking with points only, by the statistics', () => {
    const fields = { recording: 'live', statistics: 'points-only' };
    expect(wrongOf(rulesFromPart('recording', base, fields))).toEqual([
      'statistics:liveNeedsFouls',
    ]);
  });

  it('keeps the team-foul reset the admin chose, each half and once a game with quarters too (S-106, step 2.123)', () => {
    const quarters = { ...rulesFields('game', base), periods: '4' };
    for (const reset of ['period', 'half', 'game'] as const) {
      for (const fields of [quarters, { ...quarters, periods: '2' }]) {
        const rules = saved(rulesFromPart('game', base, { ...fields, teamFoulsReset: reset }));
        expect(teamFoulsCounted(rules)).toBe(reset);
        expect(rules.fouls.teamFoulsResetChosen).toBe(reset === 'period' ? undefined : true);
      }
    }
    expect(wrongOf(rulesFromPart('game', base, { ...quarters, teamFoulsReset: 'week' }))).toEqual([
      'teamFoulsReset:choice',
    ]);
  });

  describe('a season saved before step 2.123 (T-422)', () => {
    // The old form forced each period with quarters only when saving the game rules, and
    // the game-format panel offered all three, so quarters with 'half' can be stored.
    const old = {
      ...base,
      gameFormat: { ...base.gameFormat, periods: 4 as const },
      fouls: { ...base.fouls, teamFoulsReset: 'half' as const },
    };

    it('shows and counts each period, whatever it stores, until the admin chooses', () => {
      expect(teamFoulsCounted(old)).toBe('period');
      expect(rulesFields('game', old).teamFoulsReset).toBe('period');
    });

    it('is saved unchanged when the choice is left as it was', () => {
      const rules = saved(
        rulesFromPart('game', old, { ...rulesFields('game', old), bonusFouls: '6' }),
      );
      expect(rules.fouls).toEqual({ ...old.fouls, bonusFouls: 6 });
      expect(teamFoulsCounted(rules)).toBe('period');
    });

    it('counts by the half once the admin chooses it, and the choice is marked', () => {
      const rules = saved(
        rulesFromPart('game', old, { ...rulesFields('game', old), teamFoulsReset: 'half' }),
      );
      expect(rules.fouls).toEqual({ ...old.fouls, teamFoulsResetChosen: true });
      expect(teamFoulsCounted(rules)).toBe('half');
    });
  });

  describe('the periods changed and the team-foul choice left as it was (T-422)', () => {
    const chosen = (periods: 2 | 4, reset: 'half' | 'game') => ({
      ...base,
      gameFormat: { ...base.gameFormat, periods },
      fouls: { ...base.fouls, teamFoulsReset: reset, teamFoulsResetChosen: true as const },
    });

    it('each half becomes each half or quarter, halves to quarters and back', () => {
      for (const [from, to] of [
        [2, '4'],
        [4, '2'],
      ] as const) {
        const was = chosen(from, 'half');
        const rules = saved(
          rulesFromPart('game', was, { ...rulesFields('game', was), periods: to }),
        );
        expect(teamFoulsCounted(rules)).toBe('period');
        expect(rules.fouls.teamFoulsResetChosen).toBeUndefined();
      }
    });

    it('keeps never, once a game, halves to quarters and back (the confirming look)', () => {
      for (const [from, to] of [
        [2, '4'],
        [4, '2'],
      ] as const) {
        const was = chosen(from, 'game');
        const rules = saved(
          rulesFromPart('game', was, { ...rulesFields('game', was), periods: to }),
        );
        expect(teamFoulsCounted(rules)).toBe('game');
        expect(rules.fouls.teamFoulsResetChosen).toBe(true);
        expect(rules.gameFormat.periods).toBe(Number(to));
      }
    });

    it('the default halves season switched to quarters counts each quarter (the review)', () => {
      const rules = saved(
        rulesFromPart('game', base, { ...rulesFields('game', base), periods: '4' }),
      );
      expect(teamFoulsCounted(rules)).toBe('period');
    });

    it('keeps a choice changed in the same save', () => {
      const was = chosen(2, 'game');
      const fields = { ...rulesFields('game', was), periods: '4', teamFoulsReset: 'half' };
      expect(teamFoulsCounted(saved(rulesFromPart('game', was, fields)))).toBe('half');
    });

    it('keeps the choice when the periods stay', () => {
      const was = chosen(4, 'half');
      const rules = saved(
        rulesFromPart('game', was, { ...rulesFields('game', was), bonusFouls: '6' }),
      );
      expect(teamFoulsCounted(rules)).toBe('half');
    });
  });

  it('switches the unique-jersey rule, and keeps the roster limits as they are', () => {
    const limited = { ...base, rosters: { ...base.rosters, maxSize: 12 } };
    const rules = saved(rulesFromPart('rosters', limited, { uniqueJerseys: ticked }));
    expect(rules.rosters).toEqual({ ...limited.rosters, uniqueJerseys: true });
    expect(saved(rulesFromPart('rosters', rules, {})).rosters.uniqueJerseys).toBe(false);
  });
});

describe('presets', () => {
  it('fills the game rules from a preset and keeps the rest of what was typed', () => {
    const typed = { ...rulesFields('game', base), requestToken: 'abc', bonusFouls: '9' };
    const filled = withPreset('high-school', base, typed);
    expect(filled['periods']).toBe('4');
    expect(filled['periodMinutes']).toBe('8');
    expect(filled['bonusFouls']).toBe('5');
    expect(filled['requestToken']).toBe('abc');
    expect(presetOf(saved(rulesFromPart('game', base, filled)))).toBe('high-school');
  });

  it('names the preset the rules are, or none once changed', () => {
    expect(presetOf(base)).toBe('rec-league');
    expect(presetOf({ ...base, fouls: { ...base.fouls, bonusFouls: 6 } })).toBeUndefined();
  });
});

describe('the name and dates', () => {
  it('reads them, an empty date as none', () => {
    expect(nameFromPart({ name: ' Fall 2026 ', startsOn: '2026-09-01', endsOn: '' })).toEqual({
      ok: true,
      value: { name: 'Fall 2026', startsOn: '2026-09-01', endsOn: null },
    });
  });

  it('refuses an empty name, a day that is not one, and an end before the start', () => {
    expect(nameFromPart({ name: ' ', startsOn: '2026-02-30', endsOn: '' })).toEqual({
      ok: false,
      wrong: [
        { field: 'name', why: 'name' },
        { field: 'startsOn', why: 'date' },
      ],
    });
    expect(nameFromPart({ name: 'Fall', startsOn: '2026-09-01', endsOn: '2026-08-01' })).toEqual({
      ok: false,
      wrong: [{ field: 'endsOn', why: 'datesOrder' }],
    });
  });
});
