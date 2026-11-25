import {
  defaultSeasonRules,
  foulsWithReset,
  seasonRulesPreset,
  teamFoulsCounted,
  type SeasonRules,
} from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import {
  gameRuleAnswersOf,
  gameRuleQuestions,
  withGameRuleAnswers,
  type GameRuleAnswers,
} from './game-rule-answers.ts';

const rulesOf = (result: ReturnType<typeof withGameRuleAnswers>): SeasonRules => {
  if (!result.ok) throw new Error(`refused: ${result.question}`);
  return result.rules;
};

describe('withGameRuleAnswers', () => {
  it('asks the clock, the mercy rule and when team fouls start again, in that order', () => {
    expect(gameRuleQuestions).toEqual(['clockMode', 'mercyLead', 'teamFoulsReset']);
  });

  it('keeps the base untouched when no question is answered', () => {
    const base = seasonRulesPreset('high-school');
    expect(rulesOf(withGameRuleAnswers(base, {}))).toEqual(base);
  });

  it('saves a stop clock with a mercy lead', () => {
    const rules = rulesOf(
      withGameRuleAnswers(defaultSeasonRules(), { clockMode: 'stop', mercyLead: 20 }),
    );
    expect(rules.clock).toMatchObject({ mode: 'stop', mercyLead: 20 });
    expect(gameRuleAnswersOf(rules)).toEqual({
      clockMode: 'stop',
      mercyLead: 20,
      teamFoulsReset: 'period',
    });
  });

  it('refuses a mercy lead with a running clock, naming the mercy question (S-113)', () => {
    expect(
      withGameRuleAnswers(defaultSeasonRules(), { clockMode: 'running', mercyLead: 15 }),
    ).toEqual({
      ok: false,
      code: 'game-rule-refused',
      question: 'mercyLead',
    });
  });

  it('refuses a mercy lead outside the contract’s limits', () => {
    const base = seasonRulesPreset('high-school');
    for (const mercyLead of [0, 101]) {
      expect(withGameRuleAnswers(base, { mercyLead })).toMatchObject({
        ok: false,
        question: 'mercyLead',
      });
    }
  });

  it('clears a copied last-minutes stop clock when a stop clock is chosen (T-428)', () => {
    const base: SeasonRules = {
      ...defaultSeasonRules(),
      clock: { mode: 'running', stopClockLastSeconds: 120, mercyLead: null },
    };
    expect(
      rulesOf(withGameRuleAnswers(base, { clockMode: 'stop' })).clock.stopClockLastSeconds,
    ).toBeNull();
    expect(rulesOf(withGameRuleAnswers(base, {})).clock.stopClockLastSeconds).toBe(120);
  });

  describe('when team fouls start again (after step 2.123, T-422)', () => {
    const quarters = (): SeasonRules => seasonRulesPreset('high-school');

    it('writes an answer given as the settings do: the choice, marked as chosen', () => {
      const half = rulesOf(withGameRuleAnswers(quarters(), { teamFoulsReset: 'half' }));
      expect(half.fouls).toEqual(foulsWithReset(quarters().fouls, 'half'));
      expect(half.fouls.teamFoulsResetChosen).toBe(true);
      expect(teamFoulsCounted(half)).toBe('half');
      const game = rulesOf(withGameRuleAnswers(defaultSeasonRules(), { teamFoulsReset: 'game' }));
      expect(teamFoulsCounted(game)).toBe('game');
      expect(gameRuleAnswersOf(game).teamFoulsReset).toBe('game');
    });

    it('writes no marker when the question is left alone: each period, as before', () => {
      const base = defaultSeasonRules();
      const left = rulesOf(withGameRuleAnswers(base, { clockMode: 'stop' }));
      expect(left.fouls).toEqual(base.fouls);
      expect(left.fouls.teamFoulsResetChosen).toBeUndefined();
      expect(teamFoulsCounted(left)).toBe('period');
    });

    it('keeps the base’s marker, or its absence, when the answer is what the base counts', () => {
      const unmarked = defaultSeasonRules();
      expect(rulesOf(withGameRuleAnswers(unmarked, { teamFoulsReset: 'period' })).fouls).toEqual(
        unmarked.fouls,
      );
      const marked = rulesOf(withGameRuleAnswers(quarters(), { teamFoulsReset: 'half' }));
      expect(rulesOf(withGameRuleAnswers(marked, { teamFoulsReset: 'half' })).fouls).toEqual(
        marked.fouls,
      );
      const back = rulesOf(withGameRuleAnswers(marked, { teamFoulsReset: 'period' }));
      expect(back.fouls.teamFoulsResetChosen).toBeUndefined();
      expect(teamFoulsCounted(back)).toBe('period');
    });

    it('refuses an answer the contract does not know, naming the question', () => {
      const answers = { teamFoulsReset: 'quarter' } as unknown as GameRuleAnswers;
      expect(withGameRuleAnswers(defaultSeasonRules(), answers)).toMatchObject({
        ok: false,
        question: 'teamFoulsReset',
      });
    });
  });
});
