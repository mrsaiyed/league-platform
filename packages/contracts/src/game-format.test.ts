// One game's format (step 2.119): the part of a season's rules a game can be given, held
// to the same checks as a season's, laid over a season's rules, and listed rule by rule
// for the start confirmation, the clock mode included (S-39).
import { describe, expect, it } from 'vitest';
import {
  FORMAT_FACTS,
  formatFacts,
  formatOfRules,
  gameFormatPresets,
  GameFormatRules,
  parseGameFormat,
  rulesWithFormat,
  SeasonRules,
  seasonRulesPreset,
} from './season-rules.ts';

const quarters = formatOfRules(seasonRulesPreset('high-school'));
const halves = seasonRulesPreset('rec-league');

describe('a game format', () => {
  it('reads what it wrote, and refuses what a season would refuse', () => {
    expect(GameFormatRules.parse(quarters)).toEqual(quarters);
    expect(parseGameFormat(quarters)).toEqual(quarters);
    expect(parseGameFormat(null)).toBeNull();
    expect(parseGameFormat({ ...quarters, version: 2 })).toBeNull();
    // A stop clock may have the last minutes too (S-113), as a season may.
    const lastMinutesOnStop = {
      ...quarters,
      clock: { ...quarters.clock, mode: 'stop', stopClockLastSeconds: 60, mercyLead: 10 },
    };
    expect(GameFormatRules.parse(lastMinutesOnStop)).toEqual(lastMinutesOnStop);
    const mercyOnRunning = {
      ...lastMinutesOnStop,
      clock: { ...lastMinutesOnStop.clock, mode: 'running' },
    };
    expect(GameFormatRules.safeParse(mercyOnRunning).error?.issues[0]?.message).toBe(
      'A mercy rule only applies to a stop clock.',
    );
    const doubleFirst = { ...quarters, fouls: { ...quarters.fouls, doubleBonusFouls: 4 } };
    expect(GameFormatRules.safeParse(doubleFirst).success).toBe(false);
    expect(GameFormatRules.safeParse({ ...quarters, allowTies: true }).success).toBe(false);
  });

  it('takes the place of a season format and leaves the rest of the season as it is', () => {
    const played = rulesWithFormat(halves, quarters);
    expect(SeasonRules.parse(played)).toEqual(played);
    expect(played.gameFormat).toEqual({ periods: 4, periodSeconds: 480, overtimeSeconds: 240 });
    expect(played.clock.mode).toBe('stop');
    expect(played.fouls.bonusFouls).toBe(5);
    expect({ ...played, gameFormat: 0, clock: 0, fouls: 0, timeouts: 0 }).toEqual({
      ...halves,
      gameFormat: 0,
      clock: 0,
      fouls: 0,
      timeouts: 0,
    });
    expect(formatOfRules(played)).toEqual(quarters);
  });

  it('lists every rule for the confirmation, the clock mode included', () => {
    const facts = formatFacts(formatOfRules(halves));
    expect(facts.map((f) => f.fact)).toEqual([...FORMAT_FACTS]);
    expect(facts).toContainEqual({ fact: 'clockMode', value: 'running' });
    expect(facts).toContainEqual({ fact: 'stopClockScope', value: null });
    const lastMinutes = formatOfRules(halves);
    const withLast = { ...lastMinutes, clock: { ...lastMinutes.clock, stopClockLastSeconds: 120 } };
    expect(formatFacts(withLast)).toContainEqual({ fact: 'stopClockScope', value: 'half' });
  });

  it("offers the high-school and rec-league presets and the season's own", () => {
    const season = rulesWithFormat(halves, {
      ...quarters,
      gameFormat: { ...quarters.gameFormat, periodSeconds: 600 },
    });
    expect(gameFormatPresets(season)).toEqual([
      { preset: 'high-school', format: quarters },
      { preset: 'rec-league', format: formatOfRules(halves) },
      { preset: 'season', format: formatOfRules(season) },
    ]);
  });
});
