import { defaultSeasonRules, seasonRulesPreset, type SeasonRules } from '@srleagues/contracts';
import type { GameRecord } from '../../games/index.ts';
import { describe, expect, it } from 'vitest';
import { memoryLeagues, ownerId, staffId } from '../memory-leagues.test-helper.ts';
import { setSeasonRules } from './set-season-rules.ts';

const id = (n: number) => `01900000-0000-7000-8000-0000000000c${n}`;
const season = { id: id(1), programId: 'program-default', slug: 'one', isCurrent: true };

describe('setSeasonRules', () => {
  it('saves a valid rules document and logs which parts changed', async () => {
    const { db, deps, as } = memoryLeagues({ seasons: [season] });
    const rules = seasonRulesPreset('high-school');
    expect(await setSeasonRules(as(ownerId), { seasonId: id(1), version: 1, rules }, deps)).toEqual(
      { ok: true, value: { version: 2 } },
    );
    expect(db.state.seasons[0]?.rules).toEqual(rules);
    expect(db.state.activity[0]).toMatchObject({ action: 'leagues.set_season_rules' });
    const again = await setSeasonRules(as(ownerId), { seasonId: id(1), version: 2, rules }, deps);
    expect(again).toEqual({ ok: true, value: { version: 2 } });
    expect(db.state.activity).toHaveLength(1);
  });

  it('refuses invalid rules and saves nothing', async () => {
    const { db, deps, as } = memoryLeagues({ seasons: [season] });
    const bad = defaultSeasonRules();
    bad.fouls.bonusFouls = 7;
    bad.fouls.doubleBonusFouls = 3;
    expect(
      await setSeasonRules(as(ownerId), { seasonId: id(1), version: 1, rules: bad }, deps),
    ).toMatchObject({ error: { code: 'invalid-input' } });
    const unknown = { ...defaultSeasonRules(), extra: true };
    expect(
      await setSeasonRules(as(ownerId), { seasonId: id(1), version: 1, rules: unknown }, deps),
    ).toMatchObject({ error: { code: 'invalid-input' } });
    expect(db.state.seasons[0]?.rules).toBeUndefined();
    expect(db.state.activity).toEqual([]);
  });

  it('gives a version conflict to the second of two admins (A-8)', async () => {
    const { deps, as } = memoryLeagues({ seasons: [season] });
    const input = { seasonId: id(1), version: 1, rules: seasonRulesPreset('high-school') };
    expect((await setSeasonRules(as(ownerId), input, deps)).ok).toBe(true);
    expect(
      await setSeasonRules(as(ownerId), { ...input, rules: seasonRulesPreset('rec-league') }, deps),
    ).toMatchObject({ error: { code: 'changed-since-read' } });
  });

  it('refuses unique jerseys while a team has a number twice, a missing season and non-admins', async () => {
    const { deps, as } = memoryLeagues({ seasons: [{ ...season, jerseyClash: true }] });
    const rules = defaultSeasonRules();
    rules.rosters.uniqueJerseys = true;
    const run = (who: string, seasonId = id(1)) =>
      setSeasonRules(as(who), { seasonId, version: 1, rules }, deps);
    expect(await run(ownerId)).toMatchObject({ error: { code: 'unique-jerseys-clash' } });
    expect(await run(ownerId, id(9))).toMatchObject({ error: { code: 'season-not-found' } });
    expect(await run(staffId)).toMatchObject({ error: { code: 'not-allowed' } });
  });
});

// Three teams one win each in a circle: head-to-head cannot separate them. By point
// difference team 1 is second and team 3 last; by points scored team 3 is second.
const team = (n: number) => `01900000-0000-7000-8000-0000000a000${n}`;
const decided = (n: number, home: number, away: number, homeScore: number, awayScore: number) =>
  ({
    id: `01900000-0000-7000-8000-0000000b000${n}`,
    seasonId: id(1),
    divisionId: null,
    homeTeamId: team(home),
    awayTeamId: team(away),
    startsAt: `2026-12-0${n}T18:00:00.000Z`,
    status: 'final',
    captureMode: 'final',
    homeScore,
    awayScore,
    format: null,
    finalizedAt: '2026-12-20T20:00:00.000Z',
    binned: false,
    version: 1,
  }) satisfies GameRecord;
const played = {
  standing: {
    teams: [1, 2, 3].map((n) => ({ teamId: team(n), divisionId: null, seasonId: id(1) })),
    games: [decided(1, 1, 2, 60, 50), decided(2, 2, 3, 100, 60), decided(3, 3, 1, 61, 60)],
    lines: [],
    adjustments: [],
    rows: {},
    totals: {},
    locked: [],
  },
};
const byScoring = (): SeasonRules => {
  const rules = defaultSeasonRules();
  rules.tiebreakers = ['head-to-head', 'points-scored'];
  return rules;
};

describe('setSeasonRules after the first game is decided (S-1)', () => {
  it('lists the teams a tiebreaker change moves and saves nothing until confirmed', async () => {
    const { db, deps, as } = memoryLeagues({ seasons: [season], ...played });
    const input = { seasonId: id(1), version: 1, rules: byScoring() };
    const refused = await setSeasonRules(as(ownerId), input, deps);
    expect(refused).toMatchObject({ ok: false, error: { code: 'confirmation-needed' } });
    const moved = refused.ok ? [] : 'moves' in refused.error ? refused.error.moves : [];
    expect(moved.map((m) => m.teamId)).toEqual([team(1), team(3)]);
    // Nothing saved: no rules, no new version, no standings, no log entry.
    expect(db.state.seasons[0]?.rules).toBeUndefined();
    expect(db.state.seasons[0]?.version).toBeUndefined();
    expect(db.state.standing.rows).toEqual({});
    expect(db.state.activity).toEqual([]);
    // An explicit "not confirmed" is the same as saying nothing.
    expect(await setSeasonRules(as(ownerId), { ...input, confirmed: false }, deps)).toMatchObject({
      error: { code: 'confirmation-needed' },
    });
  });

  it('saves a confirmed change, works the standings out again and logs it', async () => {
    const { db, deps, as } = memoryLeagues({ seasons: [season], ...played });
    const rules = byScoring();
    expect(
      await setSeasonRules(
        as(ownerId),
        { seasonId: id(1), version: 1, rules, confirmed: true },
        deps,
      ),
    ).toEqual({ ok: true, value: { version: 2 } });
    expect(db.state.seasons[0]?.rules).toEqual(rules);
    const table = db.state.standing.rows[id(1)] ?? [];
    expect(table.find((r) => r.teamId === team(3))?.rank).toBe(2);
    expect(db.state.activity[0]).toMatchObject({
      action: 'leagues.set_season_rules',
      details: { confirmed: 'yes', teamsMoved: 2 },
    });
  });

  it('saves at once a change that moves nothing, such as the fouls', async () => {
    const { db, deps, as } = memoryLeagues({ seasons: [season], ...played });
    const rules = defaultSeasonRules();
    rules.fouls.bonusFouls = 5;
    expect(await setSeasonRules(as(ownerId), { seasonId: id(1), version: 1, rules }, deps)).toEqual(
      { ok: true, value: { version: 2 } },
    );
    expect(db.state.seasons[0]?.rules).toEqual(rules);
  });

  it('saves a tiebreaker change at once before any game is decided', async () => {
    const { deps, as } = memoryLeagues({ seasons: [season] });
    const input = { seasonId: id(1), version: 1, rules: byScoring() };
    expect(await setSeasonRules(as(ownerId), input, deps)).toEqual({
      ok: true,
      value: { version: 2 },
    });
  });
});
