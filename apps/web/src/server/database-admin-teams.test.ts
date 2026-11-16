// Admin → Teams on the database ports (step 2.93 part 5): every command and read the Teams
// screens send (the features/teams-area actions, through their own form-input and
// roster-changes helpers), run through the web app's own database ports
// (databasePorts: adminTeams) on the seeded made-up database, as each of the people the
// step names: the owner, an admin, an admin limited to another program, the coach of the
// team, the coach of another team, a scorekeeper, a signed-in stranger, another league's
// admin and nobody signed in. Who may do what is written out here from the spec (P4 §3 and
// §4: teams and their rosters are the owner's and the admins', at the team's program; the
// league list of people, and its private fields, the owner's and the admins' league-wide;
// a coach's own tools come with stage 4), not read from core, so a port that ran a command
// on the wrong transaction or let a role through would fail.
//
// Then: another league's team, roster line or person is "not found" through either league
// and nothing of it changes; a child's birth date, contact details and "minor" tick are
// given to nobody the spec does not allow, and never appear in a refusal or a log line;
// R-28 on the database, a child by birth date with the tick off treated as a child
// everywhere the ports answer; and core's event handlers given to the commands.
import {
  addToRoster,
  changeRosterEntry,
  createPerson,
  createTeam,
  eventHandlers,
  fail,
  gameFinalized,
  listPeople,
  listRoster,
  markLeft,
  ok,
  publicViewer,
  putBackOnRoster,
  readStatisticsTable,
  removePerson,
  removeTeam,
  reorderRoster,
  setNameRequest,
  setTeamStatsVisibility,
  updatePerson,
  updateTeam,
  type CommandContext,
  type CommandLogLine,
  type PersonRecord,
  type RosterLine,
  type Scope,
  type TeamRecord,
} from '@srleagues/core';
import * as database from '@srleagues/database';
import type { SessionIdentity, SignInService } from '@srleagues/providers';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addToRosterInput,
  changeEntryInput,
  changeTeamInput,
  markLeftInput,
  newTeamInput,
  putBackInput,
  teamStatsInput,
} from '../features/teams-area/form-input.ts';
import { addNewPerson, moveEntry } from '../features/teams-area/roster-changes.ts';
import { databasePorts } from './database-ports.ts';
import type { WebPorts } from './ports.ts';
import type { SignInMail } from './sign-in/sign-in-mail.ts';

const actors = [
  'owner',
  'admin',
  'otherProgramAdmin',
  'coach',
  'otherCoach',
  'scorekeeper',
  'stranger',
  'otherLeagueAdmin',
  'signedOut',
] as const;
type Actor = (typeof actors)[number];

/** Who may change teams and rosters, and read the league list (P4 §3, §4). */
const teamsPeople: readonly Actor[] = ['owner', 'admin'];

let made: database.MadeUpDatabase;
let db: database.DatabaseHandle;
let ports: WebPorts;
let leagueId: string;
let otherLeagueId: string;
let seasonId: string;
let otherSeasonId: string;
/** The seed's first team by name (Lakeside Foxes) and another one. */
let teamId: string;
let anotherTeamId: string;
const accountOf = new Map<Actor, string | null>();
/** Every T-196 line and every warning the ports wrote while this file ran. */
const logLines: CommandLogLine[] = [];
const warnings: string[] = [];
/** Every answer a command gave an actor here, to be searched for private values. */
const answers: unknown[] = [];

const sessions = new Map<string, SessionIdentity>();
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

const must = <T>(what: string, result: { ok: true; value: T } | { ok: false; error: unknown }) => {
  if (!result.ok) throw new Error(`${what}: ${JSON.stringify(result.error)}`);
  return result.value;
};
const contextOf = (actor: Actor, league = leagueId): CommandContext => ({
  leagueId: league,
  accountId: accountOf.get(actor) ?? null,
  requestId: randomUUID(),
});
const ownerOf = (league: string): CommandContext => ({
  leagueId: league,
  accountId: made.leagues.find((l) => l.leagueId === league)?.ownerAccountId ?? null,
  requestId: randomUUID(),
});
const deps = () => ports.adminTeams.deps;

beforeAll(async () => {
  made = await database.madeUpDatabase({ underWay: true });
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
    log: (line) => void logLines.push(line),
    warn: (message) => void warnings.push(message),
  });
  seasonId = (await ports.adminTeams.currentSeason(leagueId))?.id ?? '';
  otherSeasonId = (await ports.adminTeams.currentSeason(otherLeagueId))?.id ?? '';
  const teams = await ports.adminTeams.teams(leagueId, seasonId);
  teamId = teams[0]?.id ?? '';
  anotherTeamId = teams[1]?.id ?? '';
  const asOwner = { leagueId, accountId: lakeside.ownerAccountId };
  const programs = await database.withTransaction(db, asOwner, database.listPrograms);
  const camp = programs.find((p) => p.slug === 'summer-camp');
  if (camp === undefined) throw new Error('the seed has no Summer Camp');
  // An admin of the league's other program only; the coach of one team, and of another,
  // each granted by the owner as Settings → Access would.
  const grant = async (email: string, role: 'admin' | 'coach', scope: Scope) => {
    const accountId = await accountFor(email);
    const given = await database.withTransaction(db, asOwner, (scope2) =>
      database.accessStore(scope2).createGrant({
        accountId,
        role,
        scope,
        grantedByAccountId: lakeside.ownerAccountId,
      }),
    );
    if (given === 'already-held') throw new Error(`${email} already held ${role}`);
    return accountId;
  };
  accountOf.set('owner', lakeside.ownerAccountId);
  accountOf.set('admin', await accountFor('admin@lakeside.example.test'));
  accountOf.set(
    'otherProgramAdmin',
    await grant(`camp-admin-${randomUUID()}@example.test`, 'admin', {
      type: 'program',
      id: camp.id,
    }),
  );
  accountOf.set(
    'coach',
    await grant(`coach-${randomUUID()}@example.test`, 'coach', { type: 'team', id: teamId }),
  );
  accountOf.set(
    'otherCoach',
    await grant(`other-coach-${randomUUID()}@example.test`, 'coach', {
      type: 'team',
      id: anotherTeamId,
    }),
  );
  accountOf.set('scorekeeper', await accountFor('scorer@lakeside.example.test'));
  accountOf.set('stranger', await accountFor(`stranger-${randomUUID()}@example.test`));
  accountOf.set('otherLeagueAdmin', await accountFor('admin@maple.example.test'));
  accountOf.set('signedOut', null);
}, 180_000);

afterAll(async () => {
  await db.close();
  await made.close();
});

/** Everything Admin → Teams shows of a league, read by its owner: teams, rosters, people. */
async function everything(league: string) {
  const as = ownerOf(league);
  const season = await ports.adminTeams.currentSeason(league);
  const teams = season === undefined ? [] : await ports.adminTeams.teams(league, season.id);
  const rosters: Record<string, readonly RosterLine[]> = {};
  for (const team of teams) {
    rosters[team.id] = must('roster', await listRoster(as, { teamId: team.id }, deps()));
  }
  const people = must('people', await listPeople(as, { limit: 200 }, deps()));
  return { teams, rosters, people };
}

/** A team of the season made by the owner, with two players on it and one who left. */
async function fixture() {
  const as = ownerOf(leagueId);
  const name = `Fixture ${randomUUID().slice(0, 8)}`;
  const { teamId: made } = must(
    'team',
    await createTeam(as, newTeamInput({ name }, seasonId), deps()),
  );
  const person = async (n: number) =>
    must(
      'person',
      await createPerson(as, { firstName: `Fix${n}`, lastName: name.slice(8) }, deps()),
    ).personId;
  const [p1, p2, p3, free] = [await person(1), await person(2), await person(3), await person(4)];
  const entry = async (personId: string, jerseyNumber: string) =>
    must(
      'entry',
      await addToRoster(as, addToRosterInput({ team: made, jerseyNumber }, personId), deps()),
    ).rosterEntryId;
  const [e1, e2, gone] = [await entry(p1, '4'), await entry(p2, '5'), await entry(p3, '6')];
  const today = (await database.withTransaction(db, { leagueId }, database.findLeagueToday)) ?? '';
  must(
    'left',
    await markLeft(as, markLeftInput({ entry: gone, version: '1', leftOn: today }), deps()),
  );
  const team = (await ports.adminTeams.teams(leagueId, seasonId)).find((t) => t.id === made);
  if (team === undefined) throw new Error('the fixture team is not listed');
  return { team, e1, e2, gone, free, today };
}

/** Each command and read the Teams screens send, in order, as `actor`: their codes. */
async function everyCommand(actor: Actor, f: Awaited<ReturnType<typeof fixture>>) {
  const as = contextOf(actor);
  const codes: string[] = [];
  const said = (answer: unknown, code: string) => {
    answers.push(answer);
    codes.push(code);
  };
  const tell = (result: { ok: boolean; error?: { code: string } }) =>
    said(result, result.ok ? 'ok' : (result.error?.code ?? '?'));
  const screen = (result: { answer: { kind: string; code?: string } }) =>
    said(result, result.answer.kind === 'done' ? 'ok' : (result.answer.code ?? '?'));
  const version = String(f.team.version);
  // The team page's reads.
  tell(await listRoster(as, { teamId: f.team.id }, deps()));
  tell(await listPeople(as, { limit: 200 }, deps()));
  // The team: its details, who sees its numbers.
  tell(
    await updateTeam(
      as,
      changeTeamInput({ team: f.team.id, version, name: `${f.team.name} renamed` }),
      deps(),
    ),
  );
  const v2 = actorMayChange(actor) ? String(f.team.version + 1) : version;
  tell(
    await setTeamStatsVisibility(
      as,
      teamStatsInput({ team: f.team.id, version: v2, statsVisibility: 'staff' }),
      deps(),
    ),
  );
  // The roster: a person added with a number and a role, a line changed, moved, marked
  // as left and put back.
  tell(
    await addToRoster(
      as,
      addToRosterInput({ team: f.team.id, jerseyNumber: '12', role: 'captain' }, f.free),
      deps(),
    ),
  );
  tell(
    await changeRosterEntry(
      as,
      changeEntryInput({ entry: f.e1, version: '1', jerseyNumber: '40', role: 'coach' }),
      deps(),
    ),
  );
  screen(
    await moveEntry(as, deps(), {
      team: f.team.id,
      entry: f.e2,
      moveUp: '',
      order: actorMayChange(actor)
        ? (await openOrder(f.team.id)).join(',')
        : [f.e1, f.e2].join(','),
    }),
  );
  // The versions the page shows, read by the owner: a move changes both lines' places.
  tell(
    await markLeft(
      as,
      markLeftInput({ entry: f.e2, version: await entryVersion(f.e2), leftOn: f.today }),
      deps(),
    ),
  );
  tell(
    await putBackOnRoster(
      as,
      putBackInput({ team: f.team.id, entry: f.gone, version: await entryVersion(f.gone) }),
      deps(),
    ),
  );
  // Someone new to the league list, put on the roster at once; then someone taken off it.
  screen(
    await addNewPerson(as, deps(), {
      team: f.team.id,
      firstName: 'Newly',
      lastName: 'Added',
      jerseyNumber: '77',
    }),
  );
  const loose = must(
    'loose person',
    await createPerson(ownerOf(leagueId), { firstName: 'Loose', lastName: 'Person' }, deps()),
  ).personId;
  tell(await removePerson(as, { personId: loose }, deps()));
  // A team added, and the fixture's removed.
  tell(
    await createTeam(
      as,
      newTeamInput({ name: `Made by ${actor} ${randomUUID().slice(0, 6)}` }, seasonId),
      deps(),
    ),
  );
  tell(await removeTeam(as, { teamId: f.team.id }, deps()));
  return codes;

  async function entryVersion(entry: string) {
    const roster = must(
      'roster',
      await listRoster(ownerOf(leagueId), { teamId: f.team.id }, deps()),
    );
    return String(roster.find((line) => line.id === entry)?.version ?? Number.NaN);
  }
}
const actorMayChange = (actor: Actor) => teamsPeople.includes(actor);
/** The open lines of a team in roster order, as the owner reads them. */
async function openOrder(team: string) {
  const roster = must('roster', await listRoster(ownerOf(leagueId), { teamId: team }, deps()));
  return roster.filter((line) => line.leftOn === null).map((line) => line.id);
}
const commandCount = 13;

describe('Admin → Teams on the database ports, role by role', () => {
  it.each(actors)('runs every command only as the owner or an admin: %s', async (actor) => {
    const f = await fixture();
    const before = { here: await everything(leagueId), there: await everything(otherLeagueId) };
    const codes = await everyCommand(actor, f);
    expect(codes).toHaveLength(commandCount);
    if (actorMayChange(actor)) {
      expect(codes).toEqual(Array.from({ length: commandCount }, () => 'ok'));
      const after = await everything(leagueId);
      // The fixture team is gone; one the actor made is there.
      expect(after.teams.map((t) => t.id)).not.toContain(f.team.id);
      expect(after.teams.some((t) => t.name.startsWith(`Made by ${actor}`))).toBe(true);
      // Its roster as the commands left it, read through the port: the captain added with
      // 12, the line renumbered, the one put back, the new person with 77.
      const roster = must(
        'roster',
        await listRoster(ownerOf(leagueId), { teamId: f.team.id }, deps()),
      );
      const byNumber = (n: string) => roster.find((line) => line.jerseyNumber === n);
      expect(byNumber('12')).toMatchObject({ role: 'captain', leftOn: null });
      expect(byNumber('40')).toMatchObject({ id: f.e1, role: 'coach' });
      expect(byNumber('5')).toMatchObject({ id: f.e2, leftOn: f.today });
      expect(byNumber('6')).toMatchObject({ id: f.gone, leftOn: null });
      expect(byNumber('77')).toMatchObject({ firstName: 'Newly', lastName: 'Added' });
      expect(after.people.map((p) => p.firstName)).not.toContain('Loose');
    } else {
      // Refused exactly, every one, and nothing changed in either league (but the loose
      // person the owner added for the removal).
      expect(codes).toEqual(Array.from({ length: commandCount }, () => 'not-allowed'));
      const after = { here: await everything(leagueId), there: await everything(otherLeagueId) };
      const withoutLoose = (people: readonly PersonRecord[]) =>
        people.filter((p) => !(p.firstName === 'Loose' && p.lastName === 'Person'));
      expect(after.here.teams).toEqual(before.here.teams);
      expect(after.here.rosters).toEqual(before.here.rosters);
      expect(withoutLoose(after.here.people)).toEqual(withoutLoose(before.here.people));
      expect(after.there).toEqual(before.there);
    }
  });

  it('gives the screens their reads: the current season, its divisions and teams', async () => {
    expect(await ports.adminTeams.currentSeason(leagueId)).toEqual({
      id: seasonId,
      name: 'Winter Season',
    });
    expect((await ports.adminTeams.divisions(leagueId, seasonId)).map((d) => d.name)).toEqual([
      'North',
      'South',
    ]);
    const names = (await ports.adminTeams.teams(leagueId, seasonId)).map((t: TeamRecord) => t.name);
    expect(names.filter((n) => n.startsWith('Lakeside'))).toEqual([
      'Lakeside Foxes',
      'Lakeside Gulls',
      'Lakeside Herons',
      'Lakeside Otters',
      'Lakeside Owls',
      'Lakeside Pines',
    ]);
    // The other league's season, asked for through this league: nothing of it.
    expect(otherSeasonId).not.toBe('');
    expect(await ports.adminTeams.teams(leagueId, otherSeasonId)).toEqual([]);
    expect(await ports.adminTeams.divisions(leagueId, otherSeasonId)).toEqual([]);
    expect((await ports.adminTeams.teams(otherLeagueId, otherSeasonId)).length).toBe(4);
    // An id that cannot be a row's is no row, asked of no database.
    expect(await ports.adminTeams.teams(leagueId, 'not-an-id')).toEqual([]);
    expect(await ports.adminTeams.divisions(leagueId, 'not-an-id')).toEqual([]);
  });
});

describe("another league's teams, roster lines and people are not found, through either league", () => {
  /** One league's own ids, read by its owner. */
  async function idsOf(league: string) {
    const season = await ports.adminTeams.currentSeason(league);
    if (season === undefined) throw new Error('no season');
    // A seed team with a player on it (the season under way put the people on rosters).
    let found: { team: TeamRecord; entry: RosterLine } | undefined;
    for (const team of await ports.adminTeams.teams(league, season.id)) {
      const roster = must('roster', await listRoster(ownerOf(league), { teamId: team.id }, deps()));
      const entry = roster.find((line) => line.leftOn === null);
      if (entry !== undefined && team.name.startsWith('Fixture') === false) {
        found = { team, entry };
        break;
      }
    }
    const people = must('people', await listPeople(ownerOf(league), { limit: 200 }, deps()));
    const person = people[0];
    if (found === undefined || person === undefined) throw new Error('no roster line or person');
    const { team, entry } = found;
    const division = (await ports.adminTeams.divisions(league, season.id))[0];
    return { season: season.id, team, entry, person, division: division?.id ?? '' };
  }

  /** Every command aimed at `theirs` by `as`, acting in its own league with `ours`: codes. */
  async function aimedAt(
    as: CommandContext,
    ours: Awaited<ReturnType<typeof idsOf>>,
    theirs: Awaited<ReturnType<typeof idsOf>>,
  ) {
    const run = async (result: { ok: boolean; error?: { code: string } }) => {
      answers.push(result);
      return result.ok ? 'ok' : (result.error?.code ?? '?');
    };
    const team = theirs.team.id;
    return {
      listRoster: await run(await listRoster(as, { teamId: team }, deps())),
      updateTeam: await run(
        await updateTeam(as, changeTeamInput({ team, version: '1', name: 'Taken' }), deps()),
      ),
      setTeamStatsVisibility: await run(
        await setTeamStatsVisibility(
          as,
          teamStatsInput({ team, version: '1', statsVisibility: 'staff' }),
          deps(),
        ),
      ),
      createTeamInTheirSeason: await run(
        await createTeam(as, newTeamInput({ name: 'Intruder' }, theirs.season), deps()),
      ),
      createTeamInTheirDivision: await run(
        await createTeam(
          as,
          newTeamInput({ name: 'Intruder', divisionId: theirs.division }, ours.season),
          deps(),
        ),
      ),
      addToTheirTeam: await run(
        await addToRoster(as, addToRosterInput({ team }, ours.person.id), deps()),
      ),
      addTheirPerson: await run(
        await addToRoster(as, addToRosterInput({ team: ours.team.id }, theirs.person.id), deps()),
      ),
      changeRosterEntry: await run(
        await changeRosterEntry(
          as,
          changeEntryInput({ entry: theirs.entry.id, version: '1', jerseyNumber: '99' }),
          deps(),
        ),
      ),
      markLeft: await run(
        await markLeft(
          as,
          markLeftInput({ entry: theirs.entry.id, version: '1', leftOn: '2026-01-01' }),
          deps(),
        ),
      ),
      putBackOnRoster: await run(
        await putBackOnRoster(
          as,
          putBackInput({ team, entry: theirs.entry.id, version: '1' }),
          deps(),
        ),
      ),
      reorderRoster: await run(
        await reorderRoster(as, { teamId: team, rosterEntryIds: [theirs.entry.id] }, deps()),
      ),
      updatePerson: await run(
        await updatePerson(
          as,
          { personId: theirs.person.id, version: 1, firstName: 'Taken' },
          deps(),
        ),
      ),
      removePerson: await run(await removePerson(as, { personId: theirs.person.id }, deps())),
      removeTeam: await run(await removeTeam(as, { teamId: team }, deps())),
      teamsOfTheirSeason: (await ports.adminTeams.teams(as.leagueId, theirs.season)).length,
      divisionsOfTheirSeason: (await ports.adminTeams.divisions(as.leagueId, theirs.season)).length,
    };
  }

  const notFound = {
    listRoster: 'team-not-found',
    updateTeam: 'team-not-found',
    setTeamStatsVisibility: 'team-not-found',
    createTeamInTheirSeason: 'season-not-found',
    createTeamInTheirDivision: 'division-not-found',
    addToTheirTeam: 'team-not-found',
    addTheirPerson: 'person-not-found',
    changeRosterEntry: 'roster-entry-not-found',
    markLeft: 'roster-entry-not-found',
    putBackOnRoster: 'roster-entry-not-found',
    reorderRoster: 'team-not-found',
    updatePerson: 'person-not-found',
    removePerson: 'person-not-found',
    removeTeam: 'team-not-found',
    teamsOfTheirSeason: 0,
    divisionsOfTheirSeason: 0,
  };

  it("finds none of the other league's, for this league's owner and admin", async () => {
    const [here, there] = [await idsOf(leagueId), await idsOf(otherLeagueId)];
    const before = await everything(otherLeagueId);
    for (const actor of ['owner', 'admin'] as const) {
      expect(await aimedAt(contextOf(actor), here, there), actor).toEqual(notFound);
    }
    expect(await everything(otherLeagueId)).toEqual(before);
  });

  it("finds none of this league's, for the other league's own owner and admin", async () => {
    const [here, there] = [await idsOf(leagueId), await idsOf(otherLeagueId)];
    const before = await everything(leagueId);
    for (const as of [ownerOf(otherLeagueId), contextOf('otherLeagueAdmin', otherLeagueId)]) {
      expect(await aimedAt(as, there, here)).toEqual(notFound);
    }
    expect(await everything(leagueId)).toEqual(before);
  });

  it('names nothing of the other league in what it answers', async () => {
    const there = await everything(otherLeagueId);
    const theirNames = [
      ...there.teams.map((t) => t.name),
      ...there.people.flatMap((p) => [p.firstName, p.lastName]),
    ];
    const said = JSON.stringify(answers);
    for (const name of theirNames) expect(said).not.toContain(name);
  });
});

describe("a child's private fields (R-16, T-76) and R-28 on the database", () => {
  /** The seed's child in the adult league: Quinn Sample, born 2012-09-03, ticked. */
  async function quinn() {
    const people = must('people', await listPeople(ownerOf(leagueId), { limit: 200 }, deps()));
    const found = people.find((p) => p.firstName === 'Quinn');
    if (found === undefined) throw new Error('no Quinn in the seed');
    return found;
  }

  it.each(actors)(
    'gives the league list, and its private fields, only to the owner and admins: %s',
    async (actor) => {
      const listed = await listPeople(contextOf(actor), { limit: 200 }, deps());
      answers.push(listed);
      if (actorMayChange(actor)) {
        const child = must('people', listed).find((p) => p.firstName === 'Quinn');
        expect(child?.sensitive).toEqual({
          contactEmail: null,
          birthDate: '2012-09-03',
          isMinor: expect.any(Boolean),
        });
      } else {
        expect(listed).toEqual({ ok: false, error: { code: 'not-allowed' } });
      }
    },
  );

  it('reads a roster with no private field in it, even for the owner', async () => {
    const all = await everything(leagueId);
    const said = JSON.stringify(all.rosters);
    expect(said).not.toMatch(/birthDate|contactEmail|isMinor|sensitive/);
    expect(said).not.toContain('2012-09-03');
    expect(said).not.toContain('example.test');
  });

  it('treats a child by birth date with the tick off as a child, everywhere the ports answer', async () => {
    // The owner unticks the child's "minor" box; the birth date (2012) still makes them one.
    const child = await quinn();
    must(
      'untick',
      await updatePerson(
        ownerOf(leagueId),
        { personId: child.id, version: child.version, isMinor: false },
        deps(),
      ),
    );
    expect((await quinn()).sensitive?.isMinor).toBe(false);
    const { id: publicSeason } = (await ports.publicStats.seasonsOf(leagueId))[0] ?? { id: '' };
    // Read first: one snapshot transaction is open at a time.
    const teams = await ports.adminTeams.teams(leagueId, publicSeason);
    // The statistics and a team's public roster, as the pages read them: first name and
    // last initial in an adult league that shows adults in full.
    const shown = await ports.publicStats.statisticsOf(
      leagueId,
      async ({ store, settings, rosterOf }) => {
        const table = must(
          'statistics',
          await readStatisticsTable(store, {
            seasonId: publicSeason,
            viewing: {
              leagueId,
              viewer: publicViewer(leagueId),
              audience: settings.audience,
              policy: settings.namePolicy,
            },
          }),
        );
        const rosters = [];
        for (const team of teams) {
          rosters.push(await rosterOf(team.id, publicViewer(leagueId)));
        }
        return { table, rosters, audience: settings.audience };
      },
    );
    expect(shown.audience).toBe('adult');
    const statNames = shown.table.players.map((p) => p.name.text);
    expect(statNames).toContain('Quinn S.');
    expect(statNames).toContain('Morgan Example');
    const rosterNames = shown.rosters.flatMap((r) =>
      r.lines.map((line) => (line.name.shown ? line.name.text : '')),
    );
    expect(rosterNames).toContain('Quinn S.');
    expect(rosterNames).not.toContain('Quinn Sample');
    // Privacy settings still find a child in the league, so the parents' confirmation is offered.
    expect(
      await ports.adminSettings.deps.transaction(ownerOf(leagueId), (tx) =>
        tx.leagues.hasRecordedChild(),
      ),
    ).toBe(true);
    // And a request for initials is a child's, always taken, though adults may not ask (R-25).
    const now = await quinn();
    const asked = await setNameRequest(
      contextOf('admin'),
      { personId: now.id, version: now.version, showAs: 'initials', reason: 'guardianAsked' },
      deps(),
    );
    answers.push(asked);
    expect(asked).toMatchObject({ ok: true });
    const back = await quinn();
    must(
      'back',
      await setNameRequest(
        ownerOf(leagueId),
        { personId: back.id, version: back.version, showAs: 'none', reason: 'guardianAsked' },
        deps(),
      ),
    );
  });

  it('treats an adult by birth date with the tick on as an adult', async () => {
    const people = must('people', await listPeople(ownerOf(leagueId), { limit: 200 }, deps()));
    const morgan = people.find((p) => p.firstName === 'Morgan');
    if (morgan === undefined) throw new Error('no Morgan in the seed');
    must(
      'tick',
      await updatePerson(
        ownerOf(leagueId),
        { personId: morgan.id, version: morgan.version, isMinor: true },
        deps(),
      ),
    );
    const [season] = await ports.publicStats.seasonsOf(leagueId);
    const names = await ports.publicStats.statisticsOf(leagueId, async ({ store, settings }) => {
      const table = must(
        'statistics',
        await readStatisticsTable(store, {
          seasonId: season?.id ?? '',
          viewing: {
            leagueId,
            viewer: publicViewer(leagueId),
            audience: settings.audience,
            policy: settings.namePolicy,
          },
        }),
      );
      return table.players.map((p) => p.name.text);
    });
    expect(names).toContain('Morgan Example');
  });

  it('never writes a private value or a name into a log line or a warning', async () => {
    const people = must('people', await listPeople(ownerOf(leagueId), { limit: 200 }, deps()));
    const others = must('people', await listPeople(ownerOf(otherLeagueId), { limit: 200 }, deps()));
    const privateValues = [...people, ...others].flatMap((p) =>
      [p.sensitive?.birthDate, p.sensitive?.contactEmail].filter(
        (value): value is string => typeof value === 'string',
      ),
    );
    expect(privateValues).toContain('2012-09-03');
    expect(logLines.length).toBeGreaterThan(100);
    const logged = JSON.stringify([logLines, warnings]);
    for (const value of privateValues) expect(logged).not.toContain(value);
    expect(logged).not.toContain('Quinn');
    expect(logged).not.toMatch(/birth|isMinor|contactEmail/i);
  });

  it('never puts a private value in a refusal', () => {
    const refusals = answers.filter(
      (answer) =>
        typeof answer === 'object' &&
        answer !== null &&
        (('ok' in answer && answer.ok === false) ||
          ('answer' in answer &&
            typeof answer.answer === 'object' &&
            answer.answer !== null &&
            'kind' in answer.answer &&
            answer.answer.kind === 'refused')),
    );
    expect(refusals.length).toBeGreaterThan(100);
    const said = JSON.stringify(refusals);
    expect(said).not.toContain('2012-09-03');
    expect(said).not.toContain('2013-06-02');
    expect(said).not.toContain('1990-04-12');
    expect(said).not.toContain('example.test');
    expect(said).not.toMatch(/birthDate|contactEmail|isMinor/);
  });
});

describe("core's event handlers on the teams area's commands (T-24)", () => {
  it("gives the commands every one of core's handlers, never an empty list", () => {
    const given = ports.adminTeams.deps.events.map((handler) => handler.type);
    expect(given.length).toBeGreaterThan(0);
    expect(given).toEqual(eventHandlers.map((handler) => handler.type));
  });

  it("runs a handler in the command's own transaction, its stores there", async () => {
    // The standings handler, as a result in this season would run it: it rebuilds the
    // season's table in the teams area's transaction, which holds its stores.
    const handler = ports.adminTeams.deps.events.find((h) => h.type === gameFinalized);
    if (handler === undefined) throw new Error('no standings handler');
    const [season] = await ports.publicStats.seasonsOf(leagueId);
    const teamsIn = async () => {
      const standings = must(
        'standings',
        await ports.publicStats.standingsOf(leagueId, season?.id ?? ''),
      );
      return standings.tables.flatMap((t) => t.lines.map((line) => line.team.id)).sort();
    };
    // A team added has no line yet: no result has moved the table since.
    must(
      'team',
      await createTeam(
        ownerOf(leagueId),
        newTeamInput({ name: `Unranked ${randomUUID().slice(0, 6)}` }, season?.id ?? ''),
        deps(),
      ),
    );
    const listed = (await ports.adminTeams.teams(leagueId, season?.id ?? '')).map((t) => t.id);
    expect(await teamsIn()).not.toEqual([...listed].sort());
    const event = { type: gameFinalized, leagueId, gameId: randomUUID(), seasonId: season?.id };
    await ports.adminTeams.deps.transaction(ownerOf(leagueId), (tx) => handler.handle(event, tx));
    // Worked out again in the teams area's transaction: every team of the season is in it.
    expect(await teamsIn()).toEqual([...listed].sort());
  });
});
