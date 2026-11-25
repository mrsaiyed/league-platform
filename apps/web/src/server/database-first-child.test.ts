// Step 2.243 (S-109) on the made-up database, read as the public team page reads it: an
// adult league whose admin confirmed "children in full" while it had no recorded child
// records its first child. In that same save the yes goes back to no, so the team
// page's roster shows the child as the cautious start does (first name and last
// initial) until an admin confirms again. A save whose clearing cannot be made rolls
// back whole: the child is never recorded with the old yes standing.
import {
  createPerson,
  publicViewer,
  removePerson,
  setLeagueProfile,
  setSetting,
  updatePerson,
  type CommandDeps,
  type LeaguesTx,
  type PeopleTx,
} from '@srleagues/core';
import * as database from '@srleagues/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databasePublicStats } from './database-public-stats.ts';
import type { PublicStatsPorts } from './public-stats.ts';

let made: database.MadeUpDatabase;
let db: database.DatabaseHandle;
let stats: PublicStatsPorts;
let settingsDeps: CommandDeps<LeaguesTx>;
let peopleDeps: CommandDeps<PeopleTx>;
/** The people transaction with a clearing that never succeeds (the roll-back case). */
let stuckDeps: CommandDeps<PeopleTx>;

const base = (scope: database.LeagueScope) => ({
  jobs: database.jobsStore(scope),
  access: database.accessStore(scope),
  activity: database.activityLogStore(scope),
});
const rest = { events: [], log: () => {}, now: () => performance.now() };

beforeAll(async () => {
  made = await database.madeUpDatabase({ underWay: true });
  db = database.createDatabase(made.source);
  stats = databasePublicStats(database, db);
  settingsDeps = {
    transaction: database.commandTransaction(db, (scope) => ({
      ...base(scope),
      leagues: database.leaguesStore(scope),
      divisions: database.divisionsStore(scope),
    })),
    ...rest,
  };
  peopleDeps = {
    transaction: database.commandTransaction(db, (scope) => ({
      ...base(scope),
      people: database.peopleStore(scope),
    })),
    ...rest,
  };
  stuckDeps = {
    transaction: database.commandTransaction(db, (scope) => ({
      ...base(scope),
      people: { ...database.peopleStore(scope), clearLeagueSetting: async () => false },
    })),
    ...rest,
  };
}, 120_000);

afterAll(async () => {
  await db.close();
  await made.close();
});

/** Lakeside, the seed's adult league, and its one child, Quinn Sample (seed-data.ts). */
const lakeside = () => {
  const found = made.leagues.find((l) => l.slug === 'lakeside');
  if (found === undefined) throw new Error('the seed has no lakeside');
  return { leagueId: found.leagueId, accountId: found.ownerAccountId, requestId: 'first-child' };
};

const quinnNow = async () => {
  const as = lakeside();
  return peopleDeps.transaction(as, async (tx) => {
    const [quinn] = await tx.people.list({
      search: 'Quinn',
      limit: 1,
      offset: 0,
      sensitive: false,
    });
    if (quinn === undefined) throw new Error('no Quinn in lakeside');
    return {
      id: quinn.id,
      version: quinn.version,
      recordedChild: await tx.people.hasRecordedChild(),
    };
  });
};

const setQuinnBorn = async (birthDate: string, deps = peopleDeps) => {
  const quinn = await quinnNow();
  return updatePerson(
    lakeside(),
    { personId: quinn.id, version: quinn.version, birthDate, isMinor: false },
    deps,
  );
};

let yesVersion: number | null = null;
const confirmChildrenInFull = async () => {
  const saved = await setSetting(
    lakeside(),
    {
      level: 'league',
      key: 'privacy.childrenInFullConfirmed',
      value: true,
      version: yesVersion,
      confirmed: true,
    },
    settingsDeps,
  );
  if (!saved.ok) throw new Error(`not saved: ${saved.error.code}`);
  yesVersion = saved.value.version;
};

/** Whether the league's own "children in full" yes is saved. */
const yesSaved = async () =>
  settingsDeps.transaction(lakeside(), async (tx) =>
    (await tx.leagues.settingRows('privacy.childrenInFullConfirmed', {})).some(
      (row) =>
        row.level === 'league' &&
        typeof row.document === 'object' &&
        row.document !== null &&
        'value' in row.document &&
        row.document.value === true,
    ),
  );

/** Saves lakeside's time zone through leagues.set_profile, the rest of its profile kept. */
const setTimeZone = async (timeZone: string) => {
  const now = await settingsDeps.transaction(lakeside(), async (tx) => ({
    league: await tx.leagues.currentLeague(),
    profile: await tx.leagues.leagueProfile(),
  }));
  if (now.league === undefined || now.profile === undefined) throw new Error('no lakeside');
  return setLeagueProfile(
    lakeside(),
    {
      contactEmail: now.profile.contactEmail ?? 'lakeside@example.org',
      city: now.profile.city ?? '',
      timeZone,
      listed: now.profile.listed,
      version: now.league.version,
    },
    settingsDeps,
  );
};

/** Today's date (yyyy-mm-dd) in a time zone, by this computer's clock. */
const todayIn = (timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(new Date());

/** Quinn's line on his team's public page, read as the page reads it. */
const quinnOnTeamPage = async () => {
  const { leagueId } = lakeside();
  const quinn = await quinnNow();
  const [season] = await stats.seasonsOf(leagueId);
  const teams = await stats.readStoreOf(leagueId).playerTeams(season?.id ?? '');
  const teamId = teams.find((row) => row.personId === quinn.id)?.teamId;
  if (teamId === undefined) throw new Error('Quinn is on no team');
  const roster = await stats.statisticsOf(leagueId, ({ rosterOf }) =>
    rosterOf(teamId, publicViewer(leagueId)),
  );
  const names = roster.lines.map((line) => (line.name.shown ? line.name.text : null));
  return names.find((name) => name?.startsWith('Quinn')) ?? null;
};

describe('the first child an adult league records (S-109, step 2.243)', () => {
  it('a yes given while the league had no child goes back to no when its first child is recorded', async () => {
    // Confirmed while Quinn is a child, then Quinn is recorded as an adult: the league
    // has no recorded child and the yes stands, shown on no one.
    await confirmChildrenInFull();
    expect(await setQuinnBorn('2000-09-03')).toMatchObject({ ok: true });
    expect((await quinnNow()).recordedChild).toBe(false);
    expect(await quinnOnTeamPage()).toBe('Quinn Sample');

    // Recording him a child again is the league's first child: the old yes must not count.
    const saved = await setQuinnBorn('2012-09-03');
    expect(saved).toEqual({
      ok: true,
      value: { version: expect.any(Number), clearedChildrenInFull: true },
    });
    expect(await quinnOnTeamPage()).toBe('Quinn S.');

    // The admin confirms again, now that the league has a child: he is shown in full.
    yesVersion = null;
    await confirmChildrenInFull();
    expect(await quinnOnTeamPage()).toBe('Quinn Sample');

    // A second save that records a child changes nothing: the league has one already.
    expect(await setQuinnBorn('2011-09-03')).toEqual({
      ok: true,
      value: { version: expect.any(Number) },
    });
    expect(await quinnOnTeamPage()).toBe('Quinn Sample');
  });

  it('rolls the whole save back when the yes cannot be cleared: the child is not recorded', async () => {
    expect(await setQuinnBorn('2000-09-03')).toMatchObject({ ok: true });
    await expect(setQuinnBorn('2012-09-03', stuckDeps)).rejects.toThrow('still saved');
    expect((await quinnNow()).recordedChild).toBe(false);
    expect(await quinnOnTeamPage()).toBe('Quinn Sample');
  });

  it('a time zone that makes the only adult-by-a-day a child again puts the yes back', async () => {
    // Kiritimati (UTC+14) is always a day or more ahead of Pago Pago (UTC-11): born 18
    // years before Kiritimati's today, Quinn is an adult there and a child in Pago Pago.
    expect(await yesSaved()).toBe(true);
    const before = await settingsDeps.transaction(lakeside(), (tx) => tx.leagues.leagueProfile());
    expect(await setTimeZone('Pacific/Kiritimati')).toMatchObject({ ok: true });
    const [year, month, day] = todayIn('Pacific/Kiritimati').split('-');
    expect(await setQuinnBorn(`${Number(year) - 18}-${month}-${day}`)).toEqual({
      ok: true,
      value: { version: expect.any(Number) },
    });
    expect((await quinnNow()).recordedChild).toBe(false);
    expect(await quinnOnTeamPage()).toBe('Quinn Sample');

    expect(await setTimeZone('Pacific/Pago_Pago')).toEqual({
      ok: true,
      value: { version: expect.any(Number), clearedChildrenInFull: true },
    });
    expect((await quinnNow()).recordedChild).toBe(true);
    expect(await yesSaved()).toBe(false);
    expect(await quinnOnTeamPage()).toBe('Quinn S.');

    // Put back as it was: Quinn an adult, the league's own time zone.
    expect(await setQuinnBorn('2000-09-03')).toMatchObject({ ok: true });
    expect(await setTimeZone(before?.timeZone ?? 'UTC')).toMatchObject({ ok: true });
  });

  it('a new person who is a child, the first, puts the yes back in the same save', async () => {
    // A yes given while Quinn was a child, then Quinn recorded as an adult: no child.
    expect(await setQuinnBorn('2012-09-03')).toMatchObject({ ok: true });
    yesVersion = null;
    await confirmChildrenInFull();
    expect(await setQuinnBorn('2000-09-03')).toMatchObject({ ok: true });
    expect(await yesSaved()).toBe(true);

    const created = await createPerson(
      lakeside(),
      { firstName: 'Nell', lastName: 'Newcomb', birthDate: '2013-05-06' },
      peopleDeps,
    );
    expect(created).toEqual({
      ok: true,
      value: { personId: expect.any(String), clearedChildrenInFull: true },
    });
    expect(await yesSaved()).toBe(false);
    expect((await quinnNow()).recordedChild).toBe(true);

    // Nell goes to the bin: the league has no recorded child again.
    if (!created.ok) throw new Error('not created');
    expect(
      await removePerson(lakeside(), { personId: created.value.personId }, peopleDeps),
    ).toMatchObject({ ok: true });
    expect((await quinnNow()).recordedChild).toBe(false);
  });
});
