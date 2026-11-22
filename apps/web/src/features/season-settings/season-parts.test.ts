// Season settings' parts (step 2.47): each part's form shows the season's rules and gives
// back the rules with only that part changed; a box the rules refuse is named, never
// saved; nothing the product does not follow is offered or lost.
import { defaultSeasonRules, seasonRulesPreset, type SeasonRules } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import {
  columnField,
  nameFromPart,
  presetOf,
  rulesFields,
  rulesFromPart,
  teamFoulsResetFor,
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

  it('sets the team-foul reset the tracker follows: each quarter, or each half', () => {
    expect(teamFoulsResetFor(4, 'half')).toBe('period');
    expect(teamFoulsResetFor(2, 'game')).toBe('half');
    expect(teamFoulsResetFor(2, 'period')).toBe('period');
    const quarters = { ...rulesFields('game', base), periods: '4' };
    expect(saved(rulesFromPart('game', base, quarters)).fouls.teamFoulsReset).toBe('period');
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
