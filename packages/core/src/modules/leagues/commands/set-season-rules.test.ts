import { defaultSeasonRules, seasonRulesPreset } from '@srleagues/contracts';
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
