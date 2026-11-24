// Step 2.243 (S-109) on the made-up database, read as the public team page reads it: an
// adult league whose admin confirmed "children in full" while it had no recorded child
// records its first child. In that same save the yes goes back to no, so the team
// page's roster shows the child as the cautious start does (first name and last
// initial) until an admin confirms again. A save whose clearing cannot be made rolls
// back whole: the child is never recorded with the old yes standing.
import {
  publicViewer,
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
    await expect(setQuinnBorn('2012-09-03', stuckDeps)).rejects.toThrow('still yes');
    expect((await quinnNow()).recordedChild).toBe(false);
    expect(await quinnOnTeamPage()).toBe('Quinn Sample');
  });
});
