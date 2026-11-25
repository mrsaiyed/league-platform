// setLeagueProfile on a stand-in store; against the real database it is run by the role
// matrix and the two-league harness.
import { describe, expect, it } from 'vitest';
import { testDeps } from '../../../command/testing/memory-transaction.ts';
import { leagueId, memoryLeagues, ownerId } from '../memory-leagues.test-helper.ts';
import { setLeagueProfile } from './set-league-profile.ts';

const owner = { leagueId, accountId: ownerId, requestId: 'request-1' };
const input = {
  contactEmail: 'league@example.org',
  city: '  Springfield ',
  timeZone: 'Europe/London',
  listed: true,
  version: 3,
};

function setUp(status: 'draft' | 'archived' = 'draft') {
  const { db, transaction, as } = memoryLeagues();
  as(ownerId);
  if (db.state.league !== undefined) db.state.league = { ...db.state.league, status };
  return { db, deps: testDeps(transaction) };
}

describe('setLeagueProfile', () => {
  it('saves the contact email, city, time zone and listing, and logs which changed', async () => {
    const { db, deps } = setUp();
    expect(await setLeagueProfile(owner, input, deps)).toEqual({ ok: true, value: { version: 4 } });
    expect(db.state).toMatchObject({
      contactEmail: 'league@example.org',
      city: 'Springfield',
      timeZone: 'Europe/London',
      listed: true,
    });
    expect(db.state.activity).toMatchObject([
      {
        action: 'leagues.set_profile',
        targetId: leagueId,
        details: { changed: 'contactEmail,city,timeZone,listed' },
      },
    ]);
  });

  it('keeps a blank city as none, and a time zone by its canonical name', async () => {
    const { db, deps } = setUp();
    db.state.city = 'Old town';
    await setLeagueProfile(owner, { ...input, city: '   ', timeZone: 'utc' }, deps);
    expect(db.state).toMatchObject({ city: null, timeZone: 'UTC' });
  });

  it('refuses a time zone that is not a named one, and an email that is not one', async () => {
    const { db, deps } = setUp();
    expect(await setLeagueProfile(owner, { ...input, timeZone: 'EST' }, deps)).toMatchObject({
      ok: false,
    });
    expect(await setLeagueProfile(owner, { ...input, contactEmail: 'nope' }, deps)).toMatchObject({
      ok: false,
    });
    expect(db.state.timeZone).toBe('America/New_York');
  });

  it('changes nothing and logs nothing when nothing changed', async () => {
    const { db, deps } = setUp();
    const same = {
      contactEmail: 'hello@example.org',
      city: '',
      timeZone: 'America/New_York',
      listed: false,
      version: 3,
    };
    expect(await setLeagueProfile(owner, same, deps)).toEqual({ ok: true, value: { version: 3 } });
    expect(db.state.activity).toEqual([]);
  });

  it('refuses a save started from an older version (T-46)', async () => {
    const { db, deps } = setUp();
    expect(await setLeagueProfile(owner, { ...input, version: 2 }, deps)).toEqual({
      ok: false,
      error: { code: 'changed-since-read' },
    });
    expect(db.state.listed).toBe(false);
  });

  it('is refused in an archived league, which is read-only (U-9)', async () => {
    const { db, deps } = setUp('archived');
    expect(await setLeagueProfile(owner, input, deps)).toMatchObject({ ok: false });
    expect(db.state.listed).toBe(false);
  });
});

describe('setLeagueProfile and the first child (S-109)', () => {
  const yesRow = {
    place: { level: 'league' as const },
    key: 'privacy.childrenInFullConfirmed',
    document: { version: 1, value: true },
    version: 1,
  };
  const adultWithYes = (childOnlyIn: string) => {
    const { db, deps } = setUp();
    db.state.audience = 'adult';
    db.state.settings = [yesRow];
    db.state.childOnlyIn = childOnlyIn;
    return { db, deps };
  };

  it('a time zone that makes someone the first child puts the yes back to no', async () => {
    const { db, deps } = adultWithYes('Europe/London');
    expect(await setLeagueProfile(owner, input, deps)).toEqual({
      ok: true,
      value: { version: 4, clearedChildrenInFull: true },
    });
    expect(db.state.settings).toEqual([]);
    expect(db.state.activity.map((a) => a.action)).toEqual([
      'leagues.set_profile',
      'leagues.clear_setting',
    ]);
  });

  it('a time zone that makes no one a child keeps it, and so does a child already there', async () => {
    const none = adultWithYes('Asia/Tokyo');
    expect(await setLeagueProfile(owner, input, none.deps)).toEqual({
      ok: true,
      value: { version: 4 },
    });
    expect(none.db.state.settings).toEqual([yesRow]);
    const already = adultWithYes('Europe/London');
    already.db.state.recordedChild = true;
    await setLeagueProfile(owner, input, already.deps);
    expect(already.db.state.settings).toEqual([yesRow]);
  });
});
