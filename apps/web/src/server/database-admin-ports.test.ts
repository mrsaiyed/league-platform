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
// A coach is not here: a coach's grant is for one team, and a coach holds nothing in
// League settings, Season settings or the schedule, on the database as on the stand-in.
// The database does take a coach's grant for a team of the league (role_grants_scope_
// available); database-games.test.ts makes one and finds it refused in the games area.
import {
  addDraftGame,
  addDraftRound,
  changeDraftRoundDate,
  clearSetting,
  createSeason,
  discardScheduleDraft,
  fail,
  getScheduleDraft,
  getSeason,
  listVenues,
  membersStartPage,
  moveDraftGame,
  ok,
  previewSchedulePublish,
  previewSeasonRules,
  publicViewer,
  publishSchedule,
  removeDraftGame,
  removeDraftRound,
  renameDraftRound,
  setDraftRecording,
  setSeasonRules,
  setSetting,
  swapDraftGames,
  updateSeason,
  type CommandContext,
} from '@srleagues/core';
import * as database from '@srleagues/database';
import {
  createLocalBotCheck,
  type SessionIdentity,
  type SignInService,
} from '@srleagues/providers';
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
    botCheck: createLocalBotCheck({ appEnv: 'test' }),
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

  it.each(actors)(
    "saves a season's rules only as the owner or an admin, standings stores and all: %s",
    async (actor) => {
      const before = await seasonNow(winterId);
      // A change to the standings part, which works the season's standings out again.
      const tiebreakers =
        before.rules.tiebreakers[0] === 'points-scored'
          ? (['head-to-head', 'point-difference'] as const)
          : (['points-scored', 'head-to-head'] as const);
      const rules = { ...before.rules, tiebreakers: [...tiebreakers] };
      const preview = await previewSeasonRules(
        contextOf(actor),
        { seasonId: winterId, rules },
        ports.adminSettings.seasons,
      );
      const saved = await setSeasonRules(
        contextOf(actor),
        { seasonId: winterId, version: before.version, rules, confirmed: false },
        ports.adminSettings.seasons,
      );
      if (!settingsPeople.includes(actor)) {
        expect(preview).toEqual({ ok: false, error: { code: 'not-allowed' } });
        expect(saved).toEqual({ ok: false, error: { code: 'not-allowed' } });
        expect((await seasonNow(winterId)).rules).toEqual(before.rules);
        return;
      }
      // No game of the season is decided: nothing moves, so it simply saves (S-1).
      expect(preview).toEqual({ ok: true, value: { gamesDecided: false, moves: [] } });
      expect(saved).toMatchObject({ ok: true });
      const after = await seasonNow(winterId);
      expect(after.rules.tiebreakers).toEqual([...tiebreakers]);
      expect(after.rulesSaved).toBe(true);
      expect(after.version).toBeGreaterThan(before.version);
    },
  );

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

  it('opens nothing hidden to a holder read in another league, however it is handed in', async () => {
    // This league's owner, as read here (owner, every grant), handed in with the other
    // league's id: the port reads what the account holds there again, which is nothing.
    const ownerHere = await ports.accessOf(contextOf('owner'));
    expect(ownerHere?.isOwner).toBe(true);
    expect(await ports.scheduleAdmin.seasonsOf(otherLeagueId, ownerHere)).toEqual([]);
    // Nor does an admin's or a scheduler's holder from here open the other league's.
    for (const actor of ['admin', 'scheduler'] as const) {
      const here = await ports.accessOf(contextOf(actor));
      expect(await ports.scheduleAdmin.seasonsOf(otherLeagueId, here), actor).toEqual([]);
    }
    // And the other league's own admin, handed in here, is told of nothing hidden here.
    const theirs = await ports.accessOf({
      ...contextOf('otherLeagueAdmin'),
      leagueId: otherLeagueId,
    });
    expect(theirs?.grants.length ?? 0).toBeGreaterThan(0);
    expect(await ports.scheduleAdmin.seasonsOf(leagueId, theirs)).toEqual([]);
  });
});

// Admin → Schedule (half 2): every command the grid sends, through scheduleAdmin.deps, on
// the seed's Winter Season (of the default program). Reading the schedule is the owner's,
// the admins', the schedulers' at its program and the scorekeepers' (P4 §4,
// `schedule.read`); editing the draft and publishing it the owner's, the admins' and the
// schedulers' at its program (`schedule.edit`, `schedule.publish`).
const readers: readonly Actor[] = [
  'owner',
  'admin',
  'scheduler',
  'programScheduler',
  'scorekeeper',
];
const editors: readonly Actor[] = ['owner', 'admin', 'scheduler', 'programScheduler'];

/** The Winter Season's schedule as the owner reads it. */
async function draftNow() {
  const read = await getScheduleDraft(
    contextOf('owner'),
    { seasonId: winterId },
    ports.scheduleAdmin.deps,
  );
  if (!read.ok) throw new Error(`the owner cannot read the schedule: ${read.error.code}`);
  return read.value;
}
/** What the next edit names: the latest revision and the draft's id and version. */
const basisOf = (view: Awaited<ReturnType<typeof draftNow>>) => ({
  seasonId: winterId,
  basedOnRevision: view.latestRevision,
  version: view.draft?.version ?? null,
  draftId: view.draft?.id ?? null,
});
const must = <T>(what: string, result: { ok: true; value: T } | { ok: false; error: unknown }) => {
  if (!result.ok) throw new Error(`${what}: ${JSON.stringify(result.error)}`);
  return result.value;
};

/**
 * A draft of its own, made by the owner from nothing: a round with two games in it and an
 * empty round. Any draft left by the run before is discarded first.
 */
async function freshDraft(teams: readonly string[]) {
  const as = contextOf('owner');
  const deps = ports.scheduleAdmin.deps;
  const before = await draftNow();
  if (before.draft !== null) {
    must(
      'discard',
      await discardScheduleDraft(
        as,
        { seasonId: winterId, draftId: before.draft.id, version: before.draft.version },
        deps,
      ),
    );
  }
  const roundId = randomUUID();
  const emptyRoundId = randomUUID();
  const [g1, g2] = [randomUUID(), randomUUID()];
  must(
    'round',
    await addDraftRound(
      as,
      { ...basisOf(await draftNow()), roundId, label: 'Week 1', date: '2026-12-13' },
      deps,
    ),
  );
  must(
    'empty round',
    await addDraftRound(
      as,
      {
        ...basisOf(await draftNow()),
        roundId: emptyRoundId,
        label: 'Week 2',
        date: '2026-12-20',
      },
      deps,
    ),
  );
  for (const [gameId, home, away, time] of [
    [g1, teams[0], teams[1], '18:00'],
    [g2, teams[2], teams[3], '20:00'],
  ] as const) {
    must(
      'game',
      await addDraftGame(
        as,
        {
          ...basisOf(await draftNow()),
          gameId,
          homeTeamId: home ?? '',
          awayTeamId: away ?? '',
          roundId,
          date: '2026-12-13',
          time,
          venueId: null,
          court: null,
        },
        deps,
      ),
    );
  }
  const view = await draftNow();
  return { view, basis: basisOf(view), roundId, emptyRoundId, g1, g2 };
}

type Fresh = Awaited<ReturnType<typeof freshDraft>>;
type Outcome = { readonly ok: boolean; readonly error?: unknown };
type GridCommand = {
  readonly name: string;
  readonly who: readonly Actor[];
  readonly run: (context: CommandContext, s: Fresh, teams: readonly string[]) => Promise<Outcome>;
};

const gridCommands: readonly GridCommand[] = [
  {
    name: 'getScheduleDraft',
    who: readers,
    run: (c) => getScheduleDraft(c, { seasonId: winterId }, ports.scheduleAdmin.deps),
  },
  {
    name: 'listVenues',
    // Venues are the league's, shared by every program: a scheduler of any program reads them.
    who: [...readers, 'otherProgramScheduler'],
    run: (c) => listVenues(c, {}, ports.scheduleAdmin.deps),
  },
  {
    name: 'addDraftGame',
    who: editors,
    run: (c, s, teams) =>
      addDraftGame(
        c,
        {
          ...s.basis,
          gameId: randomUUID(),
          homeTeamId: teams[4] ?? '',
          awayTeamId: teams[5] ?? '',
          roundId: s.roundId,
          date: '2026-12-13',
          time: '19:00',
          venueId: null,
          court: null,
        },
        ports.scheduleAdmin.deps,
      ),
  },
  {
    name: 'moveDraftGame',
    who: editors,
    run: (c, s) =>
      moveDraftGame(
        c,
        {
          ...s.basis,
          gameId: s.g1,
          roundId: s.emptyRoundId,
          date: '2026-12-20',
          time: '17:00',
          venueId: null,
          court: null,
        },
        ports.scheduleAdmin.deps,
      ),
  },
  {
    name: 'swapDraftGames',
    who: editors,
    run: (c, s) =>
      swapDraftGames(c, { ...s.basis, gameId: s.g1, otherGameId: s.g2 }, ports.scheduleAdmin.deps),
  },
  {
    name: 'removeDraftGame',
    who: editors,
    run: (c, s) => removeDraftGame(c, { ...s.basis, gameId: s.g1 }, ports.scheduleAdmin.deps),
  },
  {
    name: 'setDraftRecording',
    who: editors,
    run: (c, s) =>
      setDraftRecording(
        c,
        { ...s.basis, gameId: s.g1, recording: 'live' },
        ports.scheduleAdmin.deps,
      ),
  },
  {
    name: 'addDraftRound',
    who: editors,
    run: (c, s) =>
      addDraftRound(
        c,
        { ...s.basis, roundId: randomUUID(), label: 'Week 3', date: '2026-12-27' },
        ports.scheduleAdmin.deps,
      ),
  },
  {
    name: 'renameDraftRound',
    who: editors,
    run: (c, s) =>
      renameDraftRound(
        c,
        { ...s.basis, roundId: s.roundId, label: 'Opening week' },
        ports.scheduleAdmin.deps,
      ),
  },
  {
    name: 'changeDraftRoundDate',
    who: editors,
    run: (c, s) =>
      changeDraftRoundDate(
        c,
        { ...s.basis, roundId: s.roundId, date: '2026-12-14' },
        ports.scheduleAdmin.deps,
      ),
  },
  {
    name: 'removeDraftRound',
    who: editors,
    run: (c, s) =>
      removeDraftRound(c, { ...s.basis, roundId: s.emptyRoundId }, ports.scheduleAdmin.deps),
  },
  {
    name: 'discardScheduleDraft',
    who: editors,
    run: (c, s) =>
      discardScheduleDraft(
        c,
        { seasonId: winterId, draftId: s.basis.draftId ?? '', version: s.basis.version ?? 1 },
        ports.scheduleAdmin.deps,
      ),
  },
  {
    name: 'previewSchedulePublish',
    who: editors,
    run: (c) => previewSchedulePublish(c, { seasonId: winterId }, ports.scheduleAdmin.deps),
  },
  {
    name: 'publishSchedule',
    who: editors,
    run: (c, s) =>
      publishSchedule(
        c,
        {
          seasonId: winterId,
          basedOnRevision: s.basis.basedOnRevision,
          draftId: s.basis.draftId ?? '',
          version: s.basis.version ?? 1,
        },
        ports.scheduleAdmin.deps,
      ),
  },
];

describe('Admin → Schedule on the database ports, role by role', () => {
  let teams: readonly string[] = [];
  beforeAll(async () => {
    teams = (await ports.scheduleAdmin.teamsOf(leagueId, winterId)).map((t) => t.id);
  });

  it("lists the season's teams by name, and none of another season or league", async () => {
    const named = await ports.scheduleAdmin.teamsOf(leagueId, winterId);
    expect(named.map((t) => t.name)).toEqual([
      'Lakeside Foxes',
      'Lakeside Gulls',
      'Lakeside Herons',
      'Lakeside Otters',
      'Lakeside Owls',
      'Lakeside Pines',
    ]);
    expect(named.every((t) => !t.removed)).toBe(true);
    expect(await ports.scheduleAdmin.teamsOf(leagueId, campSeasonId)).toEqual([]);
    expect(await ports.scheduleAdmin.teamsOf(otherLeagueId, winterId)).toEqual([]);
    expect(await ports.scheduleAdmin.teamsOf(leagueId, 'not-an-id')).toEqual([]);
  });

  it('names a team in the bin too, marked removed, so the grid never shows its id (A-17)', async () => {
    const asOwner = { leagueId, accountId: accountOf.get('owner') ?? '', requestId: randomUUID() };
    const kept = await database.withTransaction(db, asOwner, async (scope) => {
      const id = await database.insertTeam(scope, {
        seasonId: campSeasonId,
        divisionId: null,
        slug: 'binned-wrens',
        name: 'Binned Wrens',
        color: null,
        statsVisibility: 'everyone',
      });
      if (typeof id !== 'string' || id.endsWith('-taken')) throw new Error(`no team: ${id}`);
      await database.setTeamBinned(scope, id, true);
      return id;
    });
    expect(await ports.scheduleAdmin.teamsOf(leagueId, campSeasonId)).toEqual([
      { id: kept, name: 'Binned Wrens', removed: true },
    ]);
  });

  it.each(actors)('runs each command of the grid only for those it is for: %s', async (actor) => {
    const outcomes: Record<string, string> = {};
    const wanted: Record<string, string> = {};
    for (const command of gridCommands) {
      const fresh = await freshDraft(teams);
      const result = await command.run(contextOf(actor), fresh, teams);
      outcomes[command.name] = result.ok ? 'ok' : JSON.stringify(result.error);
      wanted[command.name] = command.who.includes(actor)
        ? 'ok'
        : JSON.stringify({ code: 'not-allowed' });
      // A refusal changes nothing: the draft is the owner's, as it was.
      if (!result.ok) {
        const after = await draftNow();
        expect(after.draft?.version, command.name).toBe(fresh.view.draft?.version);
        expect(after.latestRevision, command.name).toBe(fresh.view.latestRevision);
      }
    }
    expect(outcomes).toEqual(wanted);
  });

  it('publishes the draft, and the public schedule then shows its games', async () => {
    const s = await freshDraft(teams);
    const before = s.view.latestRevision;
    must(
      'publish',
      await publishSchedule(
        contextOf('scheduler'),
        {
          seasonId: winterId,
          basedOnRevision: s.basis.basedOnRevision,
          draftId: s.basis.draftId ?? '',
          version: s.basis.version ?? 1,
        },
        ports.scheduleAdmin.deps,
      ),
    );
    const after = await draftNow();
    expect(after.draft).toBeNull();
    expect(after.latestRevision).toBe((before ?? 0) + 1);
    const published = after.published.games.map((g) => g.id);
    expect(published).toEqual(expect.arrayContaining([s.g1, s.g2]));
    // Visitors see it once the season is shown (Season settings), and not before.
    expect(await ports.publicSchedule.scheduleOf(leagueId, winterId, '2026-12-01')).toBeUndefined();
    const { version } = await seasonNow(winterId);
    must(
      'show',
      await updateSeason(
        contextOf('owner'),
        { seasonId: winterId, version, status: 'active' },
        ports.adminSettings.deps,
      ),
    );
    try {
      const shown = await ports.publicSchedule.scheduleOf(leagueId, winterId, '2026-12-01');
      const games = [
        ...(shown?.rounds.flatMap((r) => r.games) ?? []),
        ...(shown?.unplacedGames ?? []),
      ];
      // The very games this publication made, not only an older revision's.
      expect(games.map((g) => g.id)).toEqual(expect.arrayContaining([s.g1, s.g2]));
      expect(shown?.rounds.map((r) => r.label)).toContain('Week 1');
    } finally {
      must(
        'hide',
        await updateSeason(
          contextOf('owner'),
          { seasonId: winterId, version: (await seasonNow(winterId)).version, status: 'draft' },
          ports.adminSettings.deps,
        ),
      );
    }
  });

  it('takes a hidden season off every public read, and puts it back when shown again', async () => {
    // What a signed-out visitor's pages read, with the season's id and a game's already in
    // hand (an old link): the schedule, a game's facts, the standings, and the statistics
    // and team pages' reads (the season, its teams, the players' totals, a team's roster).
    const gameId = (await draftNow()).published.games[0]?.id ?? '';
    const teamId = teams[0] ?? '';
    expect(gameId).not.toBe('');
    const visitorReads = async () => ({
      schedule: await ports.publicSchedule.scheduleOf(leagueId, winterId, '2026-12-01'),
      game: await ports.publicSchedule.gameFactsOf(leagueId, winterId, gameId),
      standings: await ports.publicStats.standingsOf(leagueId, winterId),
      picker: (await ports.publicStats.seasonsOf(leagueId)).map((s) => s.id),
      stats: await ports.publicStats.statisticsOf(leagueId, async ({ store, rosterOf }) => ({
        season: await store.findSeason(winterId),
        teams: (await store.teams(winterId)).map((t) => t.id),
        totals: await store.playerTotals(winterId),
        roster: await rosterOf(teamId, publicViewer(leagueId)),
      })),
    });
    const setStatus = async (status: 'active' | 'draft') =>
      must(
        status,
        await updateSeason(
          contextOf('owner'),
          { seasonId: winterId, version: (await seasonNow(winterId)).version, status },
          ports.adminSettings.deps,
        ),
      );
    const expectShown = (reads: Awaited<ReturnType<typeof visitorReads>>) => {
      expect(reads.schedule).toBeDefined();
      expect(reads.game).toBeDefined();
      expect(reads.standings.ok).toBe(true);
      expect(reads.picker).toContain(winterId);
      expect(reads.stats.season?.id).toBe(winterId);
      expect(reads.stats.teams).toContain(teamId);
    };
    try {
      await setStatus('active');
      expectShown(await visitorReads());
      // "Hide it again": every read answers as for a season that does not exist.
      await setStatus('draft');
      const hidden = await visitorReads();
      expect(hidden.schedule).toBeUndefined();
      expect(hidden.game).toBeUndefined();
      expect(hidden.standings).toEqual({ ok: false, error: { code: 'season-not-found' } });
      expect(hidden.picker).not.toContain(winterId);
      expect(hidden.stats.season).toBeUndefined();
      expect(hidden.stats.teams).toEqual([]);
      expect(hidden.stats.totals).toEqual([]);
      expect(hidden.stats.roster).toEqual({ lines: [] });
      // Shown again: each answers again.
      await setStatus('active');
      expectShown(await visitorReads());
    } finally {
      if ((await seasonNow(winterId)).status !== 'draft') await setStatus('draft');
    }
  });

  it('keeps each program-limited scheduler to its own program’s seasons', async () => {
    // The scheduler of the default program, on the camp program's season: refused, and
    // nothing is started there.
    const campView = async () =>
      must(
        'camp schedule',
        await getScheduleDraft(
          contextOf('owner'),
          { seasonId: campSeasonId },
          ports.scheduleAdmin.deps,
        ),
      );
    const before = await campView();
    const firstEdit = {
      seasonId: campSeasonId,
      basedOnRevision: before.latestRevision,
      version: before.draft?.version ?? null,
      draftId: before.draft?.id ?? null,
    };
    const round = { roundId: randomUUID(), label: 'Camp week 1', date: '2027-07-05' };
    const refused = await addDraftRound(
      contextOf('programScheduler'),
      { ...firstEdit, ...round },
      ports.scheduleAdmin.deps,
    );
    expect(refused).toEqual({ ok: false, error: { code: 'not-allowed' } });
    expect((await campView()).draft).toEqual(before.draft);
    // The camp's own scheduler, on it: done.
    const done = await addDraftRound(
      contextOf('otherProgramScheduler'),
      { ...firstEdit, ...round },
      ports.scheduleAdmin.deps,
    );
    expect(done).toMatchObject({ ok: true });
    const after = await campView();
    expect(after.draft?.savedEdits).toBe((before.draft?.savedEdits ?? 0) + 1);
    expect(after.result.rounds.map((r) => r.label)).toContain('Camp week 1');
  });

  it("finds no draft of another league's season, even for that league's owner", async () => {
    const maple = made.leagues.find((l) => l.slug === 'maple-street');
    const read = await getScheduleDraft(
      { leagueId: otherLeagueId, accountId: maple?.ownerAccountId ?? null, requestId: 'r' },
      { seasonId: winterId },
      ports.scheduleAdmin.deps,
    );
    expect(read.ok).toBe(false);
  });
});
