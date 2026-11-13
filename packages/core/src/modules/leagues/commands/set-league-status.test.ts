import { describe, expect, it } from 'vitest';
import { leagueTransitions } from '../league-states.ts';
import { leagueStatuses, type LeagueStatus } from '../league-values.ts';
import { memoryLeagues, ownerId, staffId } from '../memory-leagues.test-helper.ts';
import { setLeagueStatus } from './set-league-status.ts';

function inState(status: LeagueStatus) {
  const made = memoryLeagues();
  if (made.db.state.league !== undefined) {
    made.db.state.league = { ...made.db.state.league, status };
  }
  return made;
}

describe('setLeagueStatus', () => {
  it('lets the owner publish and archive, and bring an archived league back', async () => {
    const { db, deps, as } = memoryLeagues();
    for (const status of ['live', 'archived', 'live'] as const) {
      const version = db.state.league?.version ?? 0;
      expect(await setLeagueStatus(as(ownerId), { status, version }, deps)).toMatchObject({
        ok: true,
      });
    }
    expect(db.state.league).toMatchObject({ status: 'live', version: 6 });
  });

  it('lets only our staff suspend, and only they lift it', async () => {
    const { db, deps, as } = inState('live');
    const suspend = { status: 'suspended', version: 3 };
    const lift = { status: 'draft', version: 4 };
    expect(await setLeagueStatus(as(ownerId), suspend, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(await setLeagueStatus(as(staffId), suspend, deps)).toMatchObject({ ok: true });
    expect(await setLeagueStatus(as(ownerId), lift, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(await setLeagueStatus(as(staffId), lift, deps)).toMatchObject({ ok: true });
    expect(db.state.league?.status).toBe('draft');
  });

  it('refuses every change that is not in the table, with a typed error', async () => {
    for (const from of leagueStatuses) {
      for (const to of leagueStatuses) {
        if (leagueTransitions.some((t) => t.from === from && t.to === to)) continue;
        const { db, deps, as } = inState(from);
        const result = await setLeagueStatus(as(ownerId), { status: to, version: 3 }, deps);
        expect(result).toEqual({ ok: false, error: { code: 'illegal-transition' } });
        expect(db.state.league?.status).toBe(from);
      }
    }
  });

  it('refuses a stale version', async () => {
    const { deps, as } = memoryLeagues();
    const stale = { status: 'live', version: 2 };
    expect(await setLeagueStatus(as(ownerId), stale, deps)).toMatchObject({
      error: { code: 'changed-since-read' },
    });
  });
});
