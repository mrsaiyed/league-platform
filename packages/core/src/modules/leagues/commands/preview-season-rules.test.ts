import { defaultSeasonRules } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { memoryLeagues, ownerId, staffId } from '../memory-leagues.test-helper.ts';
import { previewSeasonRules } from './preview-season-rules.ts';

const id = (n: number) => `01900000-0000-7000-8000-0000000000c${n}`;
const season = { id: id(1), programId: 'program-default', slug: 'one', isCurrent: true };

describe('previewSeasonRules', () => {
  it('shows nothing moving before a game is decided, and writes nothing', async () => {
    const { db, deps, as } = memoryLeagues({ seasons: [season] });
    const rules = defaultSeasonRules();
    rules.tiebreakers = ['head-to-head', 'points-scored'];
    expect(await previewSeasonRules(as(ownerId), { seasonId: id(1), rules }, deps)).toEqual({
      ok: true,
      value: { gamesDecided: false, moves: [] },
    });
    expect(db.state.seasons[0]?.rules).toBeUndefined();
    expect(db.state.activity).toEqual([]);
  });

  it('refuses invalid rules, a missing season and non-admins', async () => {
    const { deps, as } = memoryLeagues({ seasons: [season] });
    const rules = defaultSeasonRules();
    expect(
      await previewSeasonRules(as(ownerId), { seasonId: id(1), rules: {} }, deps),
    ).toMatchObject({
      error: { code: 'invalid-input' },
    });
    expect(await previewSeasonRules(as(ownerId), { seasonId: id(9), rules }, deps)).toMatchObject({
      error: { code: 'season-not-found' },
    });
    expect(await previewSeasonRules(as(staffId), { seasonId: id(1), rules }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
