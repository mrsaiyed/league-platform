// Admin → People on the database ports (step 2.50): what the People screens read and run
// (features/people-area: the list and its search, one person's record, adding, fixing,
// removing), through the web app's own database ports (databasePorts: adminPeople) on the
// seeded made-up database, as each of these people: the owner, an admin, a scheduler, a
// scorekeeper, a signed-in stranger, another league's admin and nobody signed in. Who may
// do what is written out here from the spec (P4 §3 and §4: People is the owner's, the
// admins' and the registrars'; a person's private fields theirs only, R-16, T-76), not read
// from core, so a port that ran a command on the wrong transaction or let a role through
// would fail. Another league's person is "not found" from either league, and a child's
// birth date, contact details and "minor" tick are in no refusal, no list and no log line.
import {
  createPerson,
  fail,
  ok,
  removePerson,
  updatePerson,
  type CommandContext,
  type CommandLogLine,
} from '@srleagues/core';
import * as database from '@srleagues/database';
import { createLocalBotCheck } from '@srleagues/providers';
import type { SessionIdentity, SignInService } from '@srleagues/providers';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { peopleAskOf, readPeopleList, readPerson } from '../features/people-area/people-view.ts';
import { newPersonInput, personChangeInput } from '../features/people-area/person-input.ts';
import { peopleDepsOf } from './admin-people.ts';
import { databasePorts } from './database-ports.ts';
import type { WebPorts } from './ports.ts';
import type { SignInMail } from './sign-in/sign-in-mail.ts';
import { identifyNamed } from './named-identify.test-helper.ts';

const actors = [
  'owner',
  'admin',
  'scheduler',
  'scorekeeper',
  'stranger',
  'otherLeagueAdmin',
  'signedOut',
] as const;
type Actor = (typeof actors)[number];

/** Who runs People and sees a person's private fields (P4 §4, R-16): the owner and admins. */
const peoplePeople: readonly Actor[] = ['owner', 'admin'];

/** The seed's child in the adult league, and her private values (seed-data.ts). */
const child = { first: 'Quinn', last: 'Sample', born: '2012-09-03' };
/** Every private value of the seed leagues: never in a list, a refusal or a log line. */
const privateValues = [
  '1990-04-12',
  '2012-09-03',
  '2013-06-02',
  'morgan@lakeside.example.test',
  'robin@lakeside.example.test',
  'jordan.parent@maple.example.test',
];

let made: database.MadeUpDatabase;
let db: database.DatabaseHandle;
let ports: WebPorts;
let leagueId: string;
let otherLeagueId: string;
const accountOf = new Map<Actor, string | null>();
const logLines: CommandLogLine[] = [];

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
  const who = await identifyNamed(ports, token);
  if (!who.ok) throw new Error(`${email} not signed in: ${who.error.code}`);
  return who.value.accountId;
}

const contextOf = (actor: Actor, league = leagueId): CommandContext => ({
  leagueId: league,
  accountId: accountOf.get(actor) ?? null,
  requestId: randomUUID(),
});
const deps = () => ports.adminPeople.deps;

/** The id of a seed person, read by the league's owner through the list. */
async function idOf(league: string, actor: Actor, search: string): Promise<string> {
  const list = await readPeopleList(contextOf(actor, league), peopleAskOf({ q: search }), deps());
  const id = list.ok ? list.rows[0]?.id : undefined;
  if (id === undefined) throw new Error(`no ${search} in the list`);
  return id;
}

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
    botCheck: createLocalBotCheck({ appEnv: 'test' }),
    signIn: {
      identify: async ({ accessToken }: { accessToken: string }) => {
        const who = sessions.get(accessToken);
        return who === undefined ? fail({ code: 'session-ended' as const }) : ok(who);
      },
    } as unknown as SignInService,
    signInMail: {} as SignInMail,
    log: (line) => void logLines.push(line),
    warn: () => undefined,
  });
  accountOf.set('owner', lakeside.ownerAccountId);
  accountOf.set('admin', await accountFor('admin@lakeside.example.test'));
  accountOf.set('scheduler', await accountFor('scheduler@lakeside.example.test'));
  accountOf.set('scorekeeper', await accountFor('scorer@lakeside.example.test'));
  accountOf.set('stranger', await accountFor(`stranger-${randomUUID()}@example.test`));
  accountOf.set('otherLeagueAdmin', await accountFor('admin@maple.example.test'));
  accountOf.set('signedOut', null);
}, 180_000);

afterAll(async () => {
  await db.close();
  await made.close();
});

describe('Admin → People on the database, role by role (R-16, T-76)', () => {
  for (const actor of actors) {
    const allowed = peoplePeople.includes(actor);
    it(`${actor}: ${allowed ? "the list by name, the child's record with her private fields" : 'refused the list and the record, which hold nothing of her'}`, async () => {
      const childId = await idOf(leagueId, 'owner', child.last);
      const list = await readPeopleList(contextOf(actor), peopleAskOf({}), deps());
      const record = await readPerson(contextOf(actor), childId, deps());
      if (allowed) {
        expect(list.ok && list.rows.map((row) => row.name)).toContain('Quinn Sample');
        expect(record).toMatchObject({
          ok: true,
          person: { name: 'Quinn Sample', private: { birthDate: child.born, child: 'child' } },
        });
      } else {
        expect(list).toEqual({ ok: false, code: 'not-allowed' });
        expect(record).toEqual({ ok: false, code: 'not-allowed' });
      }
      // The list holds names only, for everyone; a refusal holds nothing of anyone.
      for (const value of privateValues) expect(JSON.stringify(list)).not.toContain(value);
      if (!allowed) expect(JSON.stringify(record)).not.toMatch(/Quinn|Sample|2012/);
    });
  }

  it("another league's person is not found from either league, whoever asks", async () => {
    const mapleChild = await idOf(otherLeagueId, 'otherLeagueAdmin', 'Imaginary');
    const lakesideChild = await idOf(leagueId, 'owner', child.last);
    expect(await readPerson(contextOf('owner'), mapleChild, deps())).toEqual({
      ok: false,
      code: 'person-not-found',
    });
    expect(
      await readPerson(contextOf('otherLeagueAdmin', otherLeagueId), lakesideChild, deps()),
    ).toEqual({ ok: false, code: 'person-not-found' });
    // A change aimed at another league's person changes nothing there.
    const tried = await updatePerson(
      contextOf('owner'),
      personChangeInput({ personId: mapleChild, version: '1', firstName: 'Changed' }),
      deps(),
    );
    expect(tried).toMatchObject({ ok: false, error: { code: 'person-not-found' } });
    const still = await readPerson(
      contextOf('otherLeagueAdmin', otherLeagueId),
      mapleChild,
      deps(),
    );
    expect(still.ok && still.person.firstName).toBe('Jordan');
  });
});

describe('adding, finding, fixing and removing someone on the database', () => {
  it('adds Jon Smiht on no team, finds him, puts his name right and takes him off the list', async () => {
    const owner = contextOf('owner');
    const made = await createPerson(
      owner,
      newPersonInput({ firstName: 'Jon', lastName: 'Smiht' }),
      deps(),
    );
    if (!made.ok) throw new Error(made.error.code);
    const found = await readPeopleList(owner, peopleAskOf({ q: 'smiht' }), deps());
    expect(found.ok && found.rows).toEqual([{ id: made.value.personId, name: 'Jon Smiht' }]);
    // Admin → Teams reads the very same row: one people store.
    const teams = await readPeopleList(
      owner,
      peopleAskOf({ q: 'smiht' }),
      peopleDepsOf(ports.adminTeams.deps),
    );
    expect(teams.ok && teams.rows.map((row) => row.id)).toEqual([made.value.personId]);

    const before = await readPerson(owner, made.value.personId, deps());
    if (!before.ok) throw new Error(before.code);
    const fixed = await updatePerson(
      owner,
      personChangeInput({
        personId: made.value.personId,
        version: String(before.person.version),
        firstName: 'Jon',
        lastName: 'Smith',
      }),
      deps(),
    );
    expect(fixed.ok).toBe(true);
    // A save from the page as it was before is refused: someone saved since (T-46).
    const stale = await updatePerson(
      owner,
      personChangeInput({
        personId: made.value.personId,
        version: String(before.person.version),
        firstName: 'Jonny',
        lastName: 'Smith',
      }),
      deps(),
    );
    expect(stale).toMatchObject({ ok: false, error: { code: 'changed-since-read' } });
    const after = await readPerson(owner, made.value.personId, deps());
    expect(after.ok && after.person.name).toBe('Jon Smith');

    expect((await removePerson(owner, { personId: made.value.personId }, deps())).ok).toBe(true);
    const gone = await readPeopleList(owner, peopleAskOf({ q: 'smith' }), deps());
    expect(gone.ok && gone.rows.map((row) => row.id)).not.toContain(made.value.personId);
    expect(await readPerson(owner, made.value.personId, deps())).toEqual({
      ok: false,
      code: 'person-not-found',
    });
  });

  it('an admin adds a child with an email and a birth date; a scorekeeper cannot', async () => {
    const typed = {
      firstName: 'Ada',
      lastName: `Childe${randomUUID().slice(0, 6)}`,
      contactEmail: 'ada.parent@example.test',
      birthDate: '2016-02-02',
      child: 'child',
    };
    const added = await createPerson(contextOf('admin'), newPersonInput(typed), deps());
    if (!added.ok) throw new Error(added.error.code);
    const record = await readPerson(contextOf('admin'), added.value.personId, deps());
    expect(record).toMatchObject({
      ok: true,
      person: { private: { contactEmail: 'ada.parent@example.test', birthDate: '2016-02-02' } },
    });
    const refused = await createPerson(contextOf('scorekeeper'), newPersonInput(typed), deps());
    expect(refused).toMatchObject({ ok: false, error: { code: 'not-allowed' } });
    expect(JSON.stringify(refused)).not.toMatch(/ada\.parent|2016-02-02/);
  });

  it('writes no private value into any log line', () => {
    const lines = JSON.stringify(logLines);
    expect(logLines.length).toBeGreaterThan(0);
    for (const value of [...privateValues, 'ada.parent@example.test', '2016-02-02']) {
      expect(lines).not.toContain(value);
    }
  });
});
