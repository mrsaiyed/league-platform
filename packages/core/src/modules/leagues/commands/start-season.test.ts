// startSeason's game-rule answers (S-106, step 2.245) on a stand-in store; copying a
// season's setup is tested in packages/database (leagues-commands.test.ts).
import { defaultSeasonRules, seasonRulesPreset, type SeasonRules } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { memoryLeagues, ownerId } from '../memory-leagues.test-helper.ts';
import { startSeason } from './start-season.ts';

const input = { slug: 'spring-2027', name: 'Spring 2027', carry: 'nothing' } as const;
const oldRules: SeasonRules = {
  ...seasonRulesPreset('high-school'),
  clock: { mode: 'stop', stopClockLastSeconds: null, mercyLead: 25 },
};
const withOld = () =>
  memoryLeagues({
    seasons: [
      {
        id: 'season-old',
        programId: 'program-default',
        slug: 'fall-2026',
        isCurrent: true,
        rules: oldRules,
      },
    ],
  });
const rulesOf = (db: ReturnType<typeof memoryLeagues>['db']) =>
  db.state.seasons.find((s) => s.slug === 'spring-2027')?.rules;

describe('startSeason with the game rules asked', () => {
  it('saves the answers onto the old season’s rules', async () => {
    const { db, deps, as } = withOld();
    const result = await startSeason(
      as(ownerId),
      { ...input, gameRules: { clockMode: 'stop', mercyLead: 12 } },
      deps,
    );
    expect(result).toMatchObject({ ok: true, value: { copiedFromSeasonId: 'season-old' } });
    expect(rulesOf(db)).toEqual({ ...oldRules, clock: { ...oldRules.clock, mercyLead: 12 } });
  });

  it('keeps the old season’s answers for questions left untouched', async () => {
    const { db, deps, as } = withOld();
    await startSeason(as(ownerId), { ...input, gameRules: {} }, deps);
    expect(rulesOf(db)).toEqual(oldRules);
  });

  it('starts from the starting rules when there is no current season', async () => {
    const { db, deps, as } = memoryLeagues();
    await startSeason(as(ownerId), { ...input, gameRules: { mercyLead: null } }, deps);
    expect(rulesOf(db)).toEqual(defaultSeasonRules());
  });

  it('refuses a mercy lead with a running clock before making anything (S-113)', async () => {
    const { db, deps, as } = withOld();
    expect(
      await startSeason(as(ownerId), { ...input, gameRules: { clockMode: 'running' } }, deps),
    ).toEqual({ ok: false, error: { code: 'game-rule-refused', question: 'mercyLead' } });
    expect(db.state.seasons).toHaveLength(1);
    expect(db.state.activity).toEqual([]);
  });

  it('saves no rules of its own when the questions are not given, as before', async () => {
    const { db, deps, as } = withOld();
    await startSeason(as(ownerId), input, deps);
    expect(rulesOf(db)).toBeUndefined();
  });
});
