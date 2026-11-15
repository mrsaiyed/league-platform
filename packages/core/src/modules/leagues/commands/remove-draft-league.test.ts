// removeDraftLeague on a stand-in store (step 2.150); the database's own checks,
// under the lock, are tested in packages/database (league-making/remove-league.test.ts).
import { describe, expect, it } from 'vitest';
import {
  memoryRemoval,
  removalLeagueId,
  removalOwnerId,
  removalStaffId,
} from '../memory-league-removal.test-helper.ts';
import { removeDraftLeague } from './remove-draft-league.ts';

describe('removeDraftLeague', () => {
  it('removes the context’s league, for our staff, and says what the platform log keeps', async () => {
    const { state, deps, as } = memoryRemoval();
    expect(
      await removeDraftLeague(as(removalStaffId), { typedSlug: 'made-up-hoops' }, deps),
    ).toEqual({
      ok: true,
      value: {
        leagueId: removalLeagueId,
        slug: 'made-up-hoops',
        name: 'Made-up Hoops',
        ownerAccountId: removalOwnerId,
        logEntryId: 'entry-1',
      },
    });
    expect(state.leagues).toEqual([]);
    expect(state.platformLog).toEqual([
      {
        id: 'entry-1',
        leagueId: removalLeagueId,
        slug: 'made-up-hoops',
        actorAccountId: removalStaffId,
      },
    ]);
    expect(state.jobs).toEqual([]);
  });

  it('refuses anyone who is not our staff, and nobody signed in, changing nothing', async () => {
    for (const account of [removalOwnerId, null]) {
      const { state, deps, as } = memoryRemoval();
      expect(await removeDraftLeague(as(account), { typedSlug: 'made-up-hoops' }, deps)).toEqual({
        ok: false,
        error: { code: 'not-allowed' },
      });
      expect(state.leagues).toHaveLength(1);
      expect(state.platformLog).toEqual([]);
    }
  });

  it('compares the typed short name exactly: capitals, spaces or another name stop it', async () => {
    for (const typed of ['Made-up-hoops', ' made-up-hoops', 'made-up-hoops ', 'made-up-hoop']) {
      const { state, deps, as } = memoryRemoval();
      expect(await removeDraftLeague(as(removalStaffId), { typedSlug: typed }, deps)).toEqual({
        ok: false,
        error: { code: 'short-name-differs' },
      });
      expect(state.leagues).toHaveLength(1);
    }
    const { deps, as } = memoryRemoval();
    expect(await removeDraftLeague(as(removalStaffId), { typedSlug: '' }, deps)).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  });

  it('refuses a league that is used, and says what was found', async () => {
    const found = [
      { kind: 'state', state: 'live' },
      { kind: 'rows', table: 'public.games', count: 1 },
    ] as const;
    const { state, deps, as } = memoryRemoval({ found });
    expect(
      await removeDraftLeague(as(removalStaffId), { typedSlug: 'made-up-hoops' }, deps),
    ).toEqual({ ok: false, error: { code: 'league-in-use', found } });
    expect(state.leagues).toHaveLength(1);
    expect(state.platformLog).toEqual([]);
  });

  it('says the league is not there on a second run', async () => {
    const { deps, as } = memoryRemoval();
    const typed = { typedSlug: 'made-up-hoops' };
    expect((await removeDraftLeague(as(removalStaffId), typed, deps)).ok).toBe(true);
    expect(await removeDraftLeague(as(removalStaffId), typed, deps)).toEqual({
      ok: false,
      error: { code: 'league-not-found' },
    });
  });

  it('removes only the context’s league: the input names none', async () => {
    const { state, deps, as } = memoryRemoval();
    const other = '01900000-0000-7000-8000-0000000000d1';
    expect(
      await removeDraftLeague(
        as(removalStaffId, other),
        { typedSlug: 'made-up-hoops', leagueId: removalLeagueId },
        deps,
      ),
    ).toEqual({ ok: false, error: { code: 'league-not-found' } });
    expect(state.leagues).toHaveLength(1);
  });
});
