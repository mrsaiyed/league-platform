import { describe, expect, it } from 'vitest';
// contracts may not import sports (T-21), so the tracker's two formats are written out here
// (QUARTERS and HALVES in packages/sports/src/basketball/live.ts). If those change, this
// is where the presets show they have drifted.
const QUARTERS = {
  periods: 4,
  periodSeconds: 480,
  overtimeSeconds: 240,
  bonusFouls: 5,
  doubleBonusFouls: null,
  fullTimeouts: 3,
  shortTimeouts: 2,
  timeoutsPer: 'game',
  overtimeTimeouts: 1,
  timeoutsCarry: false,
} as const;
const HALVES = {
  periods: 2,
  periodSeconds: 1200,
  overtimeSeconds: 300,
  bonusFouls: 7,
  doubleBonusFouls: 10,
  fullTimeouts: 2,
  shortTimeouts: 0,
  timeoutsPer: 'half',
  overtimeTimeouts: 1,
  timeoutsCarry: false,
} as const;
import { PlatformRules, Rules as TrackerRules } from './live-stats.ts';
import {
  SEASON_RULES_PRESETS,
  SeasonRules,
  defaultSeasonRules,
  seasonRulesPreset,
  upgradeSeasonRules,
} from './season-rules.ts';

describe('season rules presets', () => {
  it.each(SEASON_RULES_PRESETS)('%s passes the schema', (preset) => {
    expect(SeasonRules.safeParse(seasonRulesPreset(preset)).success).toBe(true);
  });

  it('custom starts from the basketball defaults', () => {
    const r = seasonRulesPreset('custom');
    expect(r).toEqual(defaultSeasonRules());
    expect(r.gameFormat).toEqual({ periods: 2, periodSeconds: 1200, overtimeSeconds: 300 });
    expect(r.fouls).toMatchObject({ bonusFouls: 7, doubleBonusFouls: 10, playerFoulLimit: 5 });
    expect(r.forfeit).toEqual({ winnerScore: 20, loserScore: 0, countsInPointDifference: false });
    expect(r.tiebreakers).toEqual(['head-to-head', 'point-difference', 'points-scored']);
    expect(r.allowTies).toBe(false);
    expect(r.clock.mode).toBe('running');
  });

  it('the rec-league preset is the P7 defaults and matches the tracker halves format', () => {
    const r = seasonRulesPreset('rec-league');
    expect(r).toEqual(defaultSeasonRules());
    expect(r.gameFormat).toEqual({
      periods: HALVES.periods,
      periodSeconds: HALVES.periodSeconds,
      overtimeSeconds: HALVES.overtimeSeconds,
    });
    expect(r.fouls.bonusFouls).toBe(HALVES.bonusFouls);
    expect(r.fouls.doubleBonusFouls).toBe(HALVES.doubleBonusFouls);
    expect(r.timeouts).toEqual({
      full: HALVES.fullTimeouts,
      short: HALVES.shortTimeouts,
      per: HALVES.timeoutsPer,
      overtime: HALVES.overtimeTimeouts,
      carry: HALVES.timeoutsCarry,
    });
  });

  it('the high-school preset matches the tracker quarters format with a stop clock', () => {
    const r = seasonRulesPreset('high-school');
    expect(r.clock.mode).toBe('stop');
    expect(r.gameFormat).toEqual({
      periods: QUARTERS.periods,
      periodSeconds: QUARTERS.periodSeconds,
      overtimeSeconds: QUARTERS.overtimeSeconds,
    });
    expect(r.fouls).toEqual({
      teamFoulsReset: 'period',
      bonusFouls: QUARTERS.bonusFouls,
      doubleBonusFouls: QUARTERS.doubleBonusFouls,
      playerFoulLimit: 5,
    });
    expect(r.timeouts).toEqual({
      full: QUARTERS.fullTimeouts,
      short: QUARTERS.shortTimeouts,
      per: QUARTERS.timeoutsPer,
      overtime: QUARTERS.overtimeTimeouts,
      carry: QUARTERS.timeoutsCarry,
    });
  });

  it.each(SEASON_RULES_PRESETS)('%s fits the tracker rules schema', (preset) => {
    const r = seasonRulesPreset(preset);
    const tracker = {
      periods: r.gameFormat.periods,
      periodSeconds: r.gameFormat.periodSeconds,
      overtimeSeconds: r.gameFormat.overtimeSeconds,
      bonusFouls: r.fouls.bonusFouls,
      doubleBonusFouls: r.fouls.doubleBonusFouls,
      fullTimeouts: r.timeouts.full,
      shortTimeouts: r.timeouts.short,
      timeoutsPer: r.timeouts.per,
      overtimeTimeouts: r.timeouts.overtime,
      timeoutsCarry: r.timeouts.carry,
    };
    expect(TrackerRules.safeParse(tracker).success).toBe(true);
  });

  it('keeps the tracker limits in step with the document limits', () => {
    const edge = (key: string, value: number, expected: boolean) => {
      const base = {
        periods: 2,
        periodSeconds: 1200,
        overtimeSeconds: 300,
        bonusFouls: 7,
        doubleBonusFouls: 10,
      };
      const doc = structuredClone(defaultSeasonRules());
      if (key === 'periodSeconds') doc.gameFormat.periodSeconds = value;
      if (key === 'overtimeSeconds') doc.gameFormat.overtimeSeconds = value;
      if (key === 'bonusFouls') doc.fouls.bonusFouls = value;
      if (key === 'doubleBonusFouls') doc.fouls.doubleBonusFouls = value;
      expect(SeasonRules.safeParse(doc).success).toBe(expected);
      expect(TrackerRules.safeParse({ ...base, [key]: value }).success).toBe(expected);
    };
    edge('periodSeconds', 59, false);
    edge('periodSeconds', 3601, false);
    edge('periodSeconds', 3600, true);
    edge('overtimeSeconds', 1801, false);
    edge('overtimeSeconds', 60, true);
    edge('bonusFouls', 31, false);
    edge('doubleBonusFouls', 41, false);
  });

  it('keeps the platform tracker limits of the three clock and foul rules in step (step 2.67)', () => {
    const base = {
      periods: 2,
      periodSeconds: 1200,
      overtimeSeconds: 300,
      bonusFouls: 7,
      doubleBonusFouls: 10,
    };
    const edge = (key: string, value: number | null, expected: boolean) => {
      const doc = structuredClone(defaultSeasonRules());
      // The document keeps the stop clock to a running clock and the mercy rule to a stop one.
      if (key === 'stopClockLastSeconds') doc.clock.stopClockLastSeconds = value;
      if (key === 'mercyLead') doc.clock = { ...doc.clock, mode: 'stop', mercyLead: value };
      if (key === 'playerFoulLimit') doc.fouls.playerFoulLimit = value;
      expect(SeasonRules.safeParse(doc).success).toBe(expected);
      expect(PlatformRules.safeParse({ ...base, [key]: value }).success).toBe(expected);
    };
    for (const key of ['stopClockLastSeconds', 'mercyLead', 'playerFoulLimit']) {
      edge(key, null, true);
      edge(key, 0, false);
      edge(key, 1, true);
      edge(key, 2.5, false);
    }
    edge('stopClockLastSeconds', 600, true);
    edge('stopClockLastSeconds', 601, false);
    edge('mercyLead', 100, true);
    edge('mercyLead', 101, false);
    edge('playerFoulLimit', 20, true);
    edge('playerFoulLimit', 21, false);
    for (const scope of ['period', 'half', 'game'] as const) {
      const doc = structuredClone(defaultSeasonRules());
      doc.clock.stopClockScope = scope;
      expect(SeasonRules.safeParse(doc).success).toBe(true);
      expect(PlatformRules.safeParse({ ...base, stopClockScope: scope }).success).toBe(true);
    }
    expect(PlatformRules.safeParse({ ...base, stopClockScope: 'quarter' }).success).toBe(false);
  });

  it('keeps the platform last-minutes stop clock within a period, as the engine does', () => {
    const base = {
      periods: 4,
      periodSeconds: 300,
      overtimeSeconds: 180,
      bonusFouls: 5,
      doubleBonusFouls: null,
    };
    expect(PlatformRules.safeParse({ ...base, stopClockLastSeconds: 300 }).success).toBe(true);
    expect(PlatformRules.safeParse({ ...base, stopClockLastSeconds: 301 }).success).toBe(false);
    expect(PlatformRules.safeParse({ ...base, stopClockLastSeconds: null }).success).toBe(true);
    const doc = structuredClone(defaultSeasonRules());
    doc.gameFormat.periodSeconds = 300;
    doc.clock = { ...doc.clock, mode: 'running', stopClockLastSeconds: 301 };
    expect(SeasonRules.safeParse(doc).success).toBe(false);
  });
});

describe('season rules limits', () => {
  const accepts = (change: (r: SeasonRules) => void) => {
    const r = structuredClone(defaultSeasonRules());
    change(r);
    return SeasonRules.safeParse(r).success;
  };

  it('refuses out-of-range values', () => {
    expect(accepts((r) => (r.gameFormat.periodSeconds = 10))).toBe(false);
    expect(accepts((r) => (r.gameFormat.periods = 3 as 2))).toBe(false);
    expect(accepts((r) => (r.fouls.bonusFouls = 0))).toBe(false);
    expect(accepts((r) => (r.fouls.playerFoulLimit = 99))).toBe(false);
    expect(accepts((r) => (r.forfeit.winnerScore = -1))).toBe(false);
    expect(accepts((r) => (r.timeouts.full = 11))).toBe(false);
    expect(accepts((r) => (r.timeouts.overtime = 6))).toBe(false);
  });

  it('checks the roster lock date against the calendar', () => {
    expect(accepts((r) => (r.rosters.locksOn = '2026-13-45'))).toBe(false);
    expect(accepts((r) => (r.rosters.locksOn = '2026-02-31'))).toBe(false);
    expect(accepts((r) => (r.rosters.locksOn = '2026-02-29'))).toBe(false);
    expect(accepts((r) => (r.rosters.locksOn = 'next week'))).toBe(false);
    expect(accepts((r) => (r.rosters.locksOn = '2028-02-29'))).toBe(true);
    expect(accepts((r) => (r.rosters.locksOn = '2026-12-01'))).toBe(true);
  });

  it('refuses rules that contradict each other', () => {
    expect(accepts((r) => (r.fouls.doubleBonusFouls = 5))).toBe(false);
    expect(accepts((r) => (r.forfeit.loserScore = 20))).toBe(false);
    expect(
      accepts((r) => {
        r.rosters.minSize = 12;
        r.rosters.maxSize = 8;
      }),
    ).toBe(false);
    expect(accepts((r) => (r.tiebreakers = ['coin-flip', 'coin-flip']))).toBe(false);
    expect(accepts((r) => (r.standings.rankBy = 'points'))).toBe(false);
    expect(accepts((r) => (r.clock.mercyLead = 30))).toBe(false);
  });

  it('keeps the stop-clock extra to a running clock, within a period, with a scope', () => {
    expect(
      accepts((r) => {
        r.clock.stopClockLastSeconds = 120;
        r.clock.stopClockScope = 'game';
      }),
    ).toBe(true);
    expect(accepts((r) => (r.clock.stopClockLastSeconds = 120))).toBe(true);
    expect(accepts((r) => (r.clock.stopClockLastSeconds = 600))).toBe(true);
    expect(
      accepts((r) => {
        r.gameFormat.periodSeconds = 300;
        r.clock.stopClockLastSeconds = 301;
      }),
    ).toBe(false);
    expect(
      accepts((r) => {
        r.clock.mode = 'stop';
        r.clock.stopClockLastSeconds = 120;
      }),
    ).toBe(false);
    expect(accepts((r) => (r.clock.stopClockScope = 'quarter' as 'half'))).toBe(false);
  });

  it('accepts a mercy rule on a stop clock', () => {
    expect(
      accepts((r) => {
        r.clock = { mode: 'stop', stopClockLastSeconds: null, mercyLead: 30 };
      }),
    ).toBe(true);
  });

  it('keeps points per result in order', () => {
    expect(accepts((r) => (r.standings.pointsPerTie = 3))).toBe(false);
    expect(accepts((r) => (r.standings.pointsPerLoss = 2))).toBe(false);
    expect(accepts((r) => (r.standings.pointsPerWin = 3))).toBe(true);
  });

  it('allows a ties column only when ties are allowed', () => {
    expect(accepts((r) => r.standings.columns.push('ties'))).toBe(false);
    expect(
      accepts((r) => {
        r.allowTies = true;
        r.standings.columns.push('ties');
      }),
    ).toBe(true);
  });

  it('lets a coin flip decide only last', () => {
    expect(accepts((r) => (r.tiebreakers = ['coin-flip', 'head-to-head']))).toBe(false);
    expect(accepts((r) => (r.tiebreakers = ['head-to-head', 'coin-flip']))).toBe(true);
    expect(accepts((r) => (r.tiebreakers = []))).toBe(true);
  });

  it('refuses live tracking with points-only statistics only', () => {
    expect(accepts((r) => (r.statistics = 'points-only'))).toBe(false);
    expect(
      accepts((r) => {
        r.recording = 'final-score';
        r.statistics = 'points-only';
      }),
    ).toBe(true);
    expect(
      accepts((r) => {
        r.recording = 'box-score';
        r.statistics = 'points-only';
      }),
    ).toBe(true);
  });

  it('refuses unknown fields and accepts valid optional extras', () => {
    expect(SeasonRules.safeParse({ ...defaultSeasonRules(), extra: 1 }).success).toBe(false);
    expect(
      accepts((r) => {
        r.fouls.playerFoulLimit = null;
        r.rosters.locksOn = '2026-12-01';
      }),
    ).toBe(true);
  });
});

describe('upgradeSeasonRules', () => {
  const old = {
    periods: 4,
    periodSeconds: 480,
    clock: 'stop',
    bonusFouls: 5,
    doubleBonusFouls: null,
    allowTies: true,
    forfeitScore: 15,
  };

  it('upgrades a document from before versions existed', () => {
    const result = upgradeSeasonRules(old);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rules.version).toBe(1);
    expect(result.rules.gameFormat.periods).toBe(4);
    expect(result.rules.clock.mode).toBe('stop');
    expect(result.rules.fouls.doubleBonusFouls).toBeNull();
    expect(result.rules.allowTies).toBe(true);
    expect(result.rules.forfeit.winnerScore).toBe(15);
    expect(result.rules.tiebreakers).toEqual(defaultSeasonRules().tiebreakers);
    expect(result.warnings).toEqual([]);
  });

  it('treats an explicit version 0 the same as no version', () => {
    expect(upgradeSeasonRules({ ...old, version: 0 })).toEqual(upgradeSeasonRules(old));
  });

  it('upgrades an empty old document to the defaults', () => {
    expect(upgradeSeasonRules({})).toEqual({
      ok: true,
      rules: defaultSeasonRules(),
      warnings: [],
    });
  });

  it('drops the double bonus when an old bonus reaches the default one', () => {
    const result = upgradeSeasonRules({ bonusFouls: 12 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rules.fouls.bonusFouls).toBe(12);
    expect(result.rules.fouls.doubleBonusFouls).toBeNull();
    expect(result.warnings).toHaveLength(1);
  });

  it('keeps an old double bonus that is valid', () => {
    const result = upgradeSeasonRules({ bonusFouls: 4, doubleBonusFouls: 8 });
    expect(result.ok && result.rules.fouls).toMatchObject({ bonusFouls: 4, doubleBonusFouls: 8 });
  });

  it('reports settings it dropped', () => {
    const result = upgradeSeasonRules({ ...old, shotClock: 24 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('shotClock');
  });

  it('passes a current document through unchanged', () => {
    const rules = seasonRulesPreset('high-school');
    expect(upgradeSeasonRules(rules)).toEqual({ ok: true, rules, warnings: [] });
  });

  it('refuses a current-version document that is not valid', () => {
    const rules = { ...defaultSeasonRules(), allowTies: 'yes' };
    expect(upgradeSeasonRules(rules)).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('refuses a newer version with its own message', () => {
    expect(upgradeSeasonRules({ version: 99 })).toMatchObject({
      ok: false,
      reason: 'unknown-version',
    });
  });

  it.each([-1, 1.5, '1', null, Number.NaN])('refuses the version %s as not valid', (version) => {
    const result = upgradeSeasonRules({ version });
    expect(result).toMatchObject({ ok: false, reason: 'bad-version' });
    const newer = upgradeSeasonRules({ version: 99 });
    if (!result.ok && !newer.ok) expect(result.message).not.toBe(newer.message);
  });

  it('refuses an invalid old document and things that are not documents', () => {
    expect(upgradeSeasonRules({ periodSeconds: 5 })).toMatchObject({
      ok: false,
      reason: 'invalid',
    });
    expect(upgradeSeasonRules(null)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(upgradeSeasonRules('rules')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(upgradeSeasonRules([])).toMatchObject({ ok: false });
  });
});
