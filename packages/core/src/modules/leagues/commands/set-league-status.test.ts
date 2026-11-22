import { describe, expect, it } from 'vitest';
import { leagueTransitions } from '../league-states.ts';
import { leagueStatuses, type LeagueStatus } from '../league-values.ts';
import { grantOf } from '../memory-bin.test-helper.ts';
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
    const { db, deps, as } = memoryLeagues({ audience: 'adult' });
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

  describe('publishing a draft (step 2.240)', () => {
    const adminId = '01900000-0000-7000-8000-0000000000c1';
    const publish = { status: 'live', version: 3 } as const;
    const namesChosen = {
      place: { level: 'league' as const },
      key: 'privacy.publicNames',
      document: { version: 1, value: 'firstNameLastInitial' },
      version: 1,
    };
    const staffed = () =>
      memoryLeagues({
        settings: [namesChosen],
        grants: [
          grantOf(adminId, 'admin'),
          grantOf(schedulerId, 'scheduler'),
          grantOf(scorekeeperId, 'scorekeeper'),
        ],
      });
    const schedulerId = '01900000-0000-7000-8000-0000000000c2';
    const scorekeeperId = '01900000-0000-7000-8000-0000000000c3';
    const strangerId = '01900000-0000-7000-8000-0000000000c4';

    it('lets the owner and an admin publish', async () => {
      for (const who of [ownerId, adminId]) {
        const { db, deps, as } = staffed();
        expect(await setLeagueStatus(as(who), publish, deps)).toEqual({
          ok: true,
          value: { status: 'live', version: 4 },
        });
        expect(db.state.league?.status).toBe('live');
        expect(db.state.activity).toHaveLength(1);
      }
    });

    it('refuses a scheduler, a scorekeeper, another league’s admin and nobody signed in', async () => {
      for (const who of [schedulerId, scorekeeperId, strangerId, null]) {
        const { db, deps, as } = staffed();
        expect(await setLeagueStatus(as(who), publish, deps)).toEqual({
          ok: false,
          error: { code: 'not-allowed' },
        });
        expect(db.state.league?.status).toBe('draft');
      }
    });

    it('refuses while a must-fix item is not met, each with its own code', async () => {
      const noEmail = memoryLeagues({ settings: [namesChosen], contactEmail: null });
      expect(await setLeagueStatus(noEmail.as(ownerId), publish, noEmail.deps)).toEqual({
        ok: false,
        error: { code: 'no-contact-email' },
      });
      const youth = memoryLeagues();
      expect(await setLeagueStatus(youth.as(ownerId), publish, youth.deps)).toEqual({
        ok: false,
        error: { code: 'privacy-not-chosen' },
      });
      const adultWithChild = memoryLeagues({ audience: 'adult', recordedChild: true });
      expect(
        await setLeagueStatus(adultWithChild.as(ownerId), publish, adultWithChild.deps),
      ).toMatchObject({ error: { code: 'privacy-not-chosen' } });
      for (const made of [noEmail, youth, adultWithChild]) {
        expect(made.db.state.league?.status).toBe('draft');
        expect(made.db.state.activity).toEqual([]);
      }
    });

    it('does not ask an archived league for them again when it is brought back', async () => {
      const { db, deps, as } = memoryLeagues({ contactEmail: null });
      if (db.state.league !== undefined) db.state.league = { ...db.state.league, status: 'archived' };
      expect(await setLeagueStatus(as(ownerId), publish, deps)).toMatchObject({ ok: true });
    });

    it('changes nothing when a published league is published again', async () => {
      const { db, deps, as } = staffed();
      expect(await setLeagueStatus(as(ownerId), publish, deps)).toMatchObject({ ok: true });
      const again = await setLeagueStatus(as(ownerId), { status: 'live', version: 4 }, deps);
      expect(again).toEqual({ ok: false, error: { code: 'illegal-transition' } });
      expect(db.state.league).toMatchObject({ status: 'live', version: 4 });
      expect(db.state.activity).toHaveLength(1);
    });
  });

  it('refuses a stale version', async () => {
    const { deps, as } = memoryLeagues();
    const stale = { status: 'live', version: 2 };
    expect(await setLeagueStatus(as(ownerId), stale, deps)).toMatchObject({
      error: { code: 'changed-since-read' },
    });
  });
});
