// Role against command on the database ports (step 2.93 part 4): every command Admin →
// League settings and Admin → Season settings send, run through the web app's own
// database ports (databasePorts: adminSettings.deps) on the made-up database, as each of
// the people the step names: the owner, an admin, a scheduler of the whole league, a
// scheduler of this program, a scheduler of another program, a scorekeeper, a stranger
// and another league's admin. Who may do what is written out here from the spec (P4 §3
// and §4: the league's settings and a season's settings are the owner's and the admins'),
// not read from core, so a port that ran a command on the wrong transaction or let a
// role through would fail. The seasons each person is told of follow the scheduling
// module's rule (mayListSeason): a season not public yet only to someone with
// `schedule.read` at its program.
//
// A coach is not here: a coach's grant is for a team, which the database does not take
// yet (role_grants_scope_available), so no coach can exist on it; the stand-in's coach
// holds nothing in Admin either.
import {
  clearSetting,
  createSeason,
  fail,
  getSeason,
  membersStartPage,
  ok,
  setSetting,
  updateSeason,
  type CommandContext,
} from '@srleagues/core';
import * as database from '@srleagues/database';
import type { SessionIdentity, SignInService } from '@srleagues/providers';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databasePorts } from './database-ports.ts';
import type { WebPorts } from './ports.ts';
import type { SignInMail } from './sign-in/sign-in-mail.ts';

const actors = [
  'owner',
  'admin',
  'scheduler',
  'programScheduler',
  'otherProgramScheduler',
  'scorekeeper',
  'stranger',
  'otherLeagueAdmin',
] as const;
type Actor = (typeof actors)[number];

let made: database.MadeUpDatabase;
let db: database.DatabaseHandle;
let ports: WebPorts;
let leagueId: string;
let otherLeagueId: string;
/** The seed's season of the default program, still being set up (not public). */
let winterId: string;
/** A season of the league's other program (the seed's Summer Camp), not public either. */
let campSeasonId: string;
const accountOf = new Map<Actor, string>();

/** Who each made-up access token is, as the sign-in service would say. */
const sessions = new Map<string, SessionIdentity>();
/** Our account for an address, as signing in makes or links it (record 052). */
async function accountFor(email: string): Promise<string> {
  const token = `token-${randomUUID()}`;
  sessions.set(token, {
    accountId: randomUUID(),
    email,
    emailConfirmed: true,
    sessionId: `session-${token}`,
    hasPassword: true,
    passwordEnteredAt: null,
    lastSignInAt: new Date('2026-11-01T10:00:00Z'),
  });
  const who = await ports.identify(token);
  if (!who.ok) throw new Error(`${email} not signed in: ${who.error.code}`);
  return who.value.accountId;
}

beforeAll(async () => {
  made = await database.madeUpDatabase();
  db = database.createDatabase(made.source);
  const lakeside = made.leagues.find((l) => l.slug === 'lakeside');
  const maple = made.leagues.find((l) => l.slug === 'maple-street');
  if (lakeside === undefined || maple === undefined) throw new Error('no seed leagues');
  leagueId = lakeside.leagueId;
  otherLeagueId = maple.leagueId;
  ports = databasePorts({
    database,
    db,
    signIn: {
      identify: async ({ accessToken }: { accessToken: string }) => {
        const who = sessions.get(accessToken);
        return who === undefined ? fail({ code: 'session-ended' as const }) : ok(who);
      },
    } as unknown as SignInService,
    signInMail: {} as SignInMail,
    log: () => {},
    warn: () => {},
  });
  const owner = lakeside.ownerAccountId;
  const asOwner = { leagueId, accountId: owner, requestId: randomUUID() };
  const programs = await database.withTransaction(db, asOwner, database.listPrograms);
  const main = programs.find((p) => p.isDefault);
  const camp = programs.find((p) => p.slug === 'summer-camp');
  if (main === undefined || camp === undefined) throw new Error('the seed has no Summer Camp');
  winterId =
    (await database.withTransaction(db, asOwner, database.listLeagueSeasons)).find(
      (s) => s.slug === 'winter-seed',
    )?.id ?? '';
  // The other program's season, by the season command, as the league's owner.
  const made2027 = await createSeason(
    asOwner,
    { programId: camp.id, slug: 'camp-2027', name: 'Camp 2027' },
    ports.adminSettings.deps,
  );
  if (!made2027.ok) throw new Error(`no camp season: ${made2027.error.code}`);
  campSeasonId = made2027.value.seasonId;
  // A scheduler of the season's own program only, granted by the owner (the seed's
  // scheduler of the other program is camp-scheduler@lakeside.example.test).
  const programScheduler = await accountFor(`program-scheduler-${randomUUID()}@example.test`);
  await database.withTransaction(db, asOwner, (scope) =>
    database.accessStore(scope).createGrant({
      accountId: programScheduler,
      role: 'scheduler',
      scope: { type: 'program', id: main.id },
      grantedByAccountId: owner,
    }),
  );
  accountOf.set('owner', owner);
  accountOf.set('admin', await accountFor('admin@lakeside.example.test'));
  accountOf.set('scheduler', await accountFor('scheduler@lakeside.example.test'));
  accountOf.set('programScheduler', programScheduler);
  accountOf.set('otherProgramScheduler', await accountFor('camp-scheduler@lakeside.example.test'));
  accountOf.set('scorekeeper', await accountFor('scorer@lakeside.example.test'));
  accountOf.set('stranger', await accountFor(`stranger-${randomUUID()}@example.test`));
  accountOf.set('otherLeagueAdmin', await accountFor('admin@maple.example.test'));
}, 120_000);

afterAll(async () => {
  await db.close();
  await made.close();
});

const contextOf = (actor: Actor): CommandContext => ({
  leagueId,
  accountId: accountOf.get(actor) ?? null,
  requestId: randomUUID(),
});

/** The league's saved start page for members as stored, or undefined when none is saved. */
async function startPage() {
  const rows = await ports.adminSettings.deps.transaction(contextOf('owner'), (tx) =>
    tx.leagues.settingRows(membersStartPage.key, {}),
  );
  return rows.find((row) => row.level === 'league');
}
/** Its row's version, or null when none is saved. */
const startPageVersion = async () => (await startPage())?.version ?? null;
/** The season as the owner reads it: its state and version. */
async function seasonNow(seasonId: string) {
  const read = await getSeason(contextOf('owner'), { seasonId }, ports.adminSettings.deps);
  if (!read.ok) throw new Error(`the owner cannot read the season: ${read.error.code}`);
  return read.value;
}

/** Who may change the league's settings and a season's (P4 §3, §4): the owner and admins. */
const settingsPeople: readonly Actor[] = ['owner', 'admin'];

describe('League settings and Season settings on the database ports, role by role', () => {
  it.each(actors)('saves a league setting only as the owner or an admin: %s', async (actor) => {
    const before = await startPage();
    // The other choice from the one saved, so a save is a change.
    const stored = before?.document as { value?: unknown } | undefined;
    const value = stored?.value === 'myTeam' ? 'leagueHome' : 'myTeam';
    const result = await setSetting(
      contextOf(actor),
      {
        level: 'league',
        key: membersStartPage.key,
        value,
        version: before?.version ?? null,
        confirmed: false,
      },
      ports.adminSettings.deps,
    );
    if (settingsPeople.includes(actor)) {
      expect(result).toMatchObject({ ok: true });
      expect((await startPage())?.document).toMatchObject({ value });
    } else {
      expect(result).toEqual({ ok: false, error: { code: 'not-allowed' } });
      expect(await startPage()).toEqual(before);
    }
  });

  it.each(actors)('goes back to the default only as the owner or an admin: %s', async (actor) => {
    // A value to go back from, saved by the owner.
    if ((await startPageVersion()) === null) {
      const saved = await setSetting(
        contextOf('owner'),
        { level: 'league', key: membersStartPage.key, value: 'myTeam', version: null },
        ports.adminSettings.deps,
      );
      expect(saved).toMatchObject({ ok: true });
    }
    const version = (await startPageVersion()) ?? Number.NaN;
    const result = await clearSetting(
      contextOf(actor),
      { level: 'league', key: membersStartPage.key, version },
      ports.adminSettings.deps,
    );
    if (settingsPeople.includes(actor)) {
      expect(result).toMatchObject({ ok: true });
      expect(await startPageVersion()).toBeNull();
    } else {
      expect(result).toEqual({ ok: false, error: { code: 'not-allowed' } });
      expect(await startPageVersion()).toBe(version);
    }
  });

  it.each(actors)("reads a season's settings only as the owner or an admin: %s", async (actor) => {
    const result = await getSeason(
      contextOf(actor),
      { seasonId: winterId },
      ports.adminSettings.deps,
    );
    if (settingsPeople.includes(actor)) {
      expect(result).toMatchObject({ ok: true, value: { id: winterId, status: 'draft' } });
    } else {
      expect(result).toEqual({ ok: false, error: { code: 'not-allowed' } });
    }
  });

  it.each(actors)(
    'shows a season to visitors and hides it again only as the owner or an admin: %s',
    async (actor) => {
      const shown = await updateSeason(
        contextOf(actor),
        { seasonId: winterId, version: (await seasonNow(winterId)).version, status: 'active' },
        ports.adminSettings.deps,
      );
      if (!settingsPeople.includes(actor)) {
        expect(shown).toEqual({ ok: false, error: { code: 'not-allowed' } });
        expect((await seasonNow(winterId)).status).toBe('draft');
        return;
      }
      expect(shown).toMatchObject({ ok: true });
      expect((await seasonNow(winterId)).status).toBe('active');
      // Visitors now see it among the public seasons; hidden again, they do not.
      expect((await ports.publicStats.seasonsOf(leagueId)).map((s) => s.id)).toContain(winterId);
      const hidden = await updateSeason(
        contextOf(actor),
        { seasonId: winterId, version: (await seasonNow(winterId)).version, status: 'draft' },
        ports.adminSettings.deps,
      );
      expect(hidden).toMatchObject({ ok: true });
      expect((await seasonNow(winterId)).status).toBe('draft');
      expect((await ports.publicStats.seasonsOf(leagueId)).map((s) => s.id)).not.toContain(
        winterId,
      );
    },
  );

  it('refuses a save made on a version that has moved on (A-8), in words the screen has', async () => {
    const version = (await seasonNow(winterId)).version;
    const first = await updateSeason(
      contextOf('owner'),
      { seasonId: winterId, version, status: 'active' },
      ports.adminSettings.deps,
    );
    expect(first).toMatchObject({ ok: true });
    const again = await updateSeason(
      contextOf('admin'),
      { seasonId: winterId, version, status: 'draft' },
      ports.adminSettings.deps,
    );
    expect(again.ok).toBe(false);
    expect((await seasonNow(winterId)).status).toBe('active');
    const back = await updateSeason(
      contextOf('owner'),
      { seasonId: winterId, version: (await seasonNow(winterId)).version, status: 'draft' },
      ports.adminSettings.deps,
    );
    expect(back).toMatchObject({ ok: true });
  });

  it("never finds another league's season, even for its own owner", async () => {
    const maple = made.leagues.find((l) => l.slug === 'maple-street');
    const read = await getSeason(
      { leagueId: otherLeagueId, accountId: maple?.ownerAccountId ?? null, requestId: 'r' },
      { seasonId: winterId },
      ports.adminSettings.deps,
    );
    expect(read.ok).toBe(false);
  });
});

describe("the seasons each person is told of (mayListSeason, the schedule admin's list)", () => {
  const named = async (actor: Actor | undefined) => {
    const holder = actor === undefined ? undefined : await ports.accessOf(contextOf(actor));
    return (await ports.scheduleAdmin.seasonsOf(leagueId, holder)).map((s) => s.name);
  };
  const expected: Readonly<Record<Actor, readonly string[]>> = {
    owner: ['Camp 2027', 'Winter Season'],
    admin: ['Camp 2027', 'Winter Season'],
    scheduler: ['Camp 2027', 'Winter Season'],
    // A scheduler limited to one program is told only of that program's season.
    programScheduler: ['Winter Season'],
    otherProgramScheduler: ['Camp 2027'],
    // A scorekeeper reads the schedule league-wide (P4 §4).
    scorekeeper: ['Camp 2027', 'Winter Season'],
    stranger: [],
    otherLeagueAdmin: [],
  };

  it.each(actors)(
    'names a season not public yet only to someone who may read it: %s',
    async (actor) => {
      expect(await named(actor)).toEqual(expected[actor]);
    },
  );

  it('names none to nobody signed in, and every public one to everyone', async () => {
    expect(await named(undefined)).toEqual([]);
    const { version } = await seasonNow(winterId);
    await updateSeason(
      contextOf('owner'),
      { seasonId: winterId, version, status: 'active' },
      ports.adminSettings.deps,
    );
    try {
      for (const actor of [undefined, ...actors]) {
        expect(await named(actor)).toContain('Winter Season');
      }
      // Each season says whether visitors can see it, and its program.
      const listed = await ports.scheduleAdmin.seasonsOf(
        leagueId,
        await ports.accessOf(contextOf('owner')),
      );
      expect(listed.map((s) => [s.name, s.isPublic])).toEqual([
        ['Winter Season', true],
        ['Camp 2027', false],
      ]);
      expect(listed.find((s) => s.id === campSeasonId)?.programId).not.toBe(
        listed.find((s) => s.id === winterId)?.programId,
      );
    } finally {
      await updateSeason(
        contextOf('owner'),
        { seasonId: winterId, version: (await seasonNow(winterId)).version, status: 'draft' },
        ports.adminSettings.deps,
      );
    }
  });

  it("tells this league's owner nothing of another league's season not public yet", async () => {
    // What the owner holds there, read in that league, as every page reads it: nothing.
    const there = await ports.accessOf({ ...contextOf('owner'), leagueId: otherLeagueId });
    expect(await ports.scheduleAdmin.seasonsOf(otherLeagueId, there)).toEqual([]);
    // Its own owner is told of it, and of nothing of this league.
    const maple = made.leagues.find((l) => l.slug === 'maple-street');
    const theirOwner = await ports.accessOf({
      leagueId: otherLeagueId,
      accountId: maple?.ownerAccountId ?? null,
      requestId: randomUUID(),
    });
    const theirs = await ports.scheduleAdmin.seasonsOf(otherLeagueId, theirOwner);
    expect(theirs.map((s) => s.name)).toEqual(['Spring Season']);
    expect(theirs.map((s) => s.id)).not.toContain(winterId);
  });
});
