// Step 2.17's commands against the real database: each call is one transaction
// (commandTransaction). Covers the search, the bin, the version check and, above
// all, R-16 and T-76: a role without `people.read_sensitive` is never given a birth
// date or contact email, because the query for that role does not select them. Their
// isolation cases are in ../isolation.
import type { PGlite } from '@electric-sql/pglite';
import {
  createPerson,
  listPeople,
  rolePermissions,
  removePerson,
  setNameRequest,
  updatePerson,
  type CommandDeps,
  type Job,
  type PeopleTx,
} from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { findPerson, listPeople as listPeopleQuery } from '../queries/index.ts';
import {
  allPersonColumns,
  publicPersonColumns,
  sensitivePersonColumns,
} from '../queries/person-summary.ts';
import {
  freshSchema,
  newAccount,
  newLeague,
  newPerson,
  one,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { accessStore } from './access-store.ts';
import { activityLogStore } from './activity-log-store.ts';
import { peopleStore } from './people-store.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let deps: CommandDeps<PeopleTx>;
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  const transaction = commandTransaction(db, (scope) => ({
    jobs: { enqueue: async (_job: Job) => {} },
    people: peopleStore(scope),
    access: accessStore(scope),
    activity: activityLogStore(scope),
  }));
  deps = { transaction, events: [], log: () => {}, now: () => 0 };
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

type Made = MadeLeague & { as: (accountId: string) => ReturnType<typeof contextOf> };
const contextOf = (leagueId: string, accountId: string) => ({
  leagueId,
  accountId,
  requestId: 'r-1',
});

async function league(): Promise<Made> {
  const made = await newLeague(pglite);
  return { ...made, as: (accountId) => contextOf(made.leagueId, accountId) };
}

async function newSensitivePerson(leagueId: string) {
  const personId = await newPerson(pglite, leagueId);
  await pglite.query(
    "update people set contact_email = 'test@example.test', birth_date = '2011-04-05', is_minor = true where id = $1",
    [personId],
  );
  return personId;
}

async function accountWith(leagueId: string, role: string) {
  const accountId = await newAccount(pglite);
  await pglite.query('insert into role_grants (league_id, account_id, role) values ($1, $2, $3)', [
    leagueId,
    accountId,
    role,
  ]);
  return accountId;
}

const sensitiveText = /birth|email|isMinor|sensitive|2011-04-05|@example\.test/i;

describe('the people commands on the database', () => {
  it('adds, finds, edits and bins a person, and keeps the row (A-5)', async () => {
    const l = await league();
    const created = await createPerson(
      l.as(l.ownerId),
      {
        firstName: 'Sam',
        lastName: 'Ng',
        publicName: 'Sammy',
        contactEmail: 'sam@example.test',
        birthDate: '2011-04-05',
        isMinor: true,
      },
      deps,
    );
    if (!created.ok) throw new Error('not created');
    const { personId } = created.value;

    const listed = await listPeople(l.as(l.ownerId), {}, deps);
    expect(listed).toMatchObject({
      ok: true,
      value: [
        {
          id: personId,
          lastName: 'Ng',
          publicName: 'Sammy',
          version: 1,
          sensitive: { contactEmail: 'sam@example.test', birthDate: '2011-04-05', isMinor: true },
        },
      ],
    });

    expect(
      await updatePerson(
        l.as(l.ownerId),
        { personId, version: 1, birthDate: null, lastName: 'Ngu' },
        deps,
      ),
    ).toEqual({ ok: true, value: { version: 2 } });
    expect(
      await updatePerson(l.as(l.ownerId), { personId, version: 1, firstName: 'Late' }, deps),
    ).toMatchObject({ error: { code: 'changed-since-read' } });

    expect(await removePerson(l.as(l.ownerId), { personId }, deps)).toMatchObject({ ok: true });
    expect(await listPeople(l.as(l.ownerId), {}, deps)).toEqual({ ok: true, value: [] });
    const row = await one<{ deleted_at: Date | null; last_name: string }>(
      pglite,
      'select deleted_at, last_name from people where id = $1',
      [personId],
    );
    expect(row.deleted_at).not.toBeNull();
    expect(row.last_name).toBe('Ngu');
    expect(
      await updatePerson(l.as(l.ownerId), { personId, version: 3, firstName: 'X' }, deps),
    ).toMatchObject({ error: { code: 'person-not-found' } });
  });

  it('searches by name and public name, never by email, and pages', async () => {
    const l = await league();
    for (const [first, last, email] of [
      ['Ann', 'Baker', 'ann@example.test'],
      ['Bo', 'Adams', 'bo@example.test'],
      ['Cy', 'Percent%', 'cy@example.test'],
    ] as const) {
      await createPerson(
        l.as(l.ownerId),
        { firstName: first, lastName: last, contactEmail: email },
        deps,
      );
    }
    const names = async (accountId: string, input: object) => {
      const result = await listPeople(l.as(accountId), input, deps);
      return result.ok ? result.value.map((p) => p.lastName) : 'refused';
    };
    expect(await names(l.ownerId, {})).toEqual(['Adams', 'Baker', 'Percent%']);
    expect(await names(l.ownerId, { search: 'ann b' })).toEqual(['Baker']);
    expect(await names(l.ownerId, { search: 'baker ann' })).toEqual(['Baker']);
    expect(await names(l.ownerId, { search: 'ann baker' })).toEqual(['Baker']);
    expect(await names(l.ownerId, { search: 'ADAMS' })).toEqual(['Adams']);
    // Names only, whoever asks (P6, part 1 of the fix round): an email finds no one.
    expect(await names(l.ownerId, { search: 'bo@example' })).toEqual([]);
    expect(await names(l.ownerId, { search: '%' })).toEqual(['Percent%']);
    expect(await names(l.ownerId, { limit: 1, offset: 1 })).toEqual(['Baker']);
  });

  it('sorts names without regard to capitals', async () => {
    const l = await league();
    for (const [first, last] of [
      ['Zed', 'Zimmer'],
      ['ann', 'de Vries'],
      ['Bea', 'Adams'],
      ['al', 'adams'],
    ] as const) {
      await createPerson(l.as(l.ownerId), { firstName: first, lastName: last }, deps);
    }
    const listed = await listPeople(l.as(l.ownerId), {}, deps);
    expect(listed.ok ? listed.value.map((p) => `${p.firstName} ${p.lastName}`) : listed).toEqual([
      'al adams',
      'Bea Adams',
      'ann de Vries',
      'Zed Zimmer',
    ]);
  });

  it('refuses removing a person who is on a roster, until they leave it', async () => {
    const l = await league();
    const personId = await newPerson(pglite, l.leagueId);
    const season = await one<{ id: string }>(
      pglite,
      `insert into seasons (league_id, program_id, slug, name) values ($1, $2, 's', 'S') returning id`,
      [l.leagueId, l.defaultProgramId],
    );
    const team = await one<{ id: string }>(
      pglite,
      `insert into teams (league_id, season_id, slug, name, stats_visibility) values ($1, $2, 't', 'T', 'staff') returning id`,
      [l.leagueId, season.id],
    );
    const entry = await one<{ id: string }>(
      pglite,
      `insert into roster_entries (league_id, team_id, person_id) values ($1, $2, $3) returning id`,
      [l.leagueId, team.id, personId],
    );
    expect(await removePerson(l.as(l.ownerId), { personId }, deps)).toMatchObject({
      error: { code: 'person-on-a-roster' },
    });
    await pglite.query(`update roster_entries set left_on = '2026-11-01' where id = $1`, [
      entry.id,
    ]);
    expect(await removePerson(l.as(l.ownerId), { personId }, deps)).toMatchObject({ ok: true });
  });

  it('never selects a birth date or contact for a scorekeeper, and refuses their list', async () => {
    const l = await league();
    const scorekeeper = await accountWith(l.leagueId, 'scorekeeper');
    await newSensitivePerson(l.leagueId);
    expect(await listPeople(l.as(scorekeeper), {}, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(
      await createPerson(
        l.as(scorekeeper),
        { firstName: 'A', lastName: 'B', birthDate: '2011-04-05' },
        deps,
      ),
    ).toMatchObject({ error: { code: 'not-allowed' } });
  });

  it('gives a registrar the sensitive fields and keeps them out of a query that did not ask', async () => {
    const l = await league();
    const registrar = await accountWith(l.leagueId, 'registrar');
    await newSensitivePerson(l.leagueId);
    const asked = await listPeople(l.as(registrar), {}, deps);
    expect(asked).toMatchObject({
      ok: true,
      value: [{ sensitive: { birthDate: '2011-04-05', contactEmail: 'test@example.test' } }],
    });
    // The query for a reader who may not see them: the keys are not there at all, and
    // the column list it selects has no sensitive column (T-76).
    const plain = await withTransaction(
      db,
      { leagueId: l.leagueId, accountId: l.ownerId },
      (scope) => listPeopleQuery(scope, { limit: 10, offset: 0, sensitive: false }),
    );
    expect(plain).toHaveLength(1);
    expect(JSON.stringify(plain)).not.toMatch(sensitiveText);
    for (const column of sensitivePersonColumns) {
      expect(publicPersonColumns as readonly string[]).not.toContain(column);
      expect(allPersonColumns as readonly string[]).toContain(column);
    }
  });

  /**
   * No role holds people.read and people.manage without people.read_sensitive, so
   * the test takes that one permission off the registrar for the length of a call.
   */
  async function withoutSensitiveRead<T>(run: () => Promise<T>): Promise<T> {
    const held = rolePermissions.registrar as string[];
    const at = held.indexOf('people.read_sensitive');
    if (at < 0) throw new Error('the registrar no longer holds people.read_sensitive');
    held.splice(at, 1);
    try {
      return await run();
    } finally {
      held.splice(at, 0, 'people.read_sensitive');
    }
  }

  it('gives a reader without people.read_sensitive no private key and no search by email', async () => {
    const l = await league();
    const reader = await accountWith(l.leagueId, 'registrar');
    const personId = await newSensitivePerson(l.leagueId);
    await pglite.query("update people set first_name = 'Quinn', last_name = 'Vale' where id = $1", [
      personId,
    ]);
    const version = (
      await one<{ version: number }>(pglite, 'select version from people where id = $1', [personId])
    ).version;
    await withoutSensitiveRead(async () => {
      const listed = await listPeople(l.as(reader), {}, deps);
      if (!listed.ok) throw new Error('not listed');
      expect(listed.value).toHaveLength(1);
      expect(Object.keys(listed.value[0] ?? {}).sort()).toEqual(
        ['binned', 'firstName', 'id', 'lastName', 'publicName', 'version', 'visibility'].sort(),
      );
      expect(JSON.stringify(listed.value)).not.toMatch(sensitiveText);
      // An email finds nothing for this reader, nor for anyone (P6).
      expect(await listPeople(l.as(reader), { search: 'test@example' }, deps)).toEqual({
        ok: true,
        value: [],
      });
      expect(await listPeople(l.as(reader), { search: 'vale' }, deps)).toMatchObject({
        value: [{ id: personId }],
      });
      // Fixing a name works; touching a private field is refused, and nothing leaks either way.
      const found = await withTransaction(
        db,
        { leagueId: l.leagueId, accountId: reader },
        (scope) => findPerson(scope, personId, false),
      );
      expect(found).toBeDefined();
      expect(Object.keys(found ?? {})).not.toContain('sensitive');
      expect(JSON.stringify(found)).not.toMatch(sensitiveText);
      expect(
        await updatePerson(l.as(reader), { personId, version, birthDate: null }, deps),
      ).toMatchObject({ error: { code: 'sensitive-fields-not-allowed' } });
      expect(
        await updatePerson(l.as(reader), { personId, version, firstName: 'Quincy' }, deps),
      ).toEqual({ ok: true, value: { version: version + 1 } });
    });
    const stored = await one<{ contact_email: string; birth_date: string | Date }>(
      pglite,
      'select contact_email, birth_date from people where id = $1',
      [personId],
    );
    expect(stored.contact_email).toBe('test@example.test');
    // Not for the owner either: the search is by name only, whoever asks (P6).
    const withEmail = await listPeople(l.as(l.ownerId), { search: 'test@example' }, deps);
    expect(withEmail).toEqual({ ok: true, value: [] });
  });

  it('treats a person merged into another as not found, in find, update and remove', async () => {
    const l = await league();
    const keeper = await newPerson(pglite, l.leagueId);
    const merged = await newPerson(pglite, l.leagueId);
    await pglite.query('update people set merged_into_id = $1 where id = $2', [keeper, merged]);
    const before = await one<{ version: number }>(
      pglite,
      'select version from people where id = $1',
      [merged],
    );
    for (const sensitive of [false, true]) {
      const found = await withTransaction(
        db,
        { leagueId: l.leagueId, accountId: l.ownerId },
        (scope) => findPerson(scope, merged, sensitive),
      );
      expect(found).toBeUndefined();
    }
    expect(
      await updatePerson(
        l.as(l.ownerId),
        { personId: merged, version: before.version, firstName: 'X' },
        deps,
      ),
    ).toMatchObject({ error: { code: 'person-not-found' } });
    expect(await removePerson(l.as(l.ownerId), { personId: merged }, deps)).toMatchObject({
      error: { code: 'person-not-found' },
    });
    const row = await one<{ first_name: string; deleted_at: Date | null; version: number }>(
      pglite,
      'select first_name, deleted_at, version from people where id = $1',
      [merged],
    );
    expect(row.first_name).not.toBe('X');
    expect(row.deleted_at).toBeNull();
    expect(row.version).toBe(before.version);
    expect(await removePerson(l.as(l.ownerId), { personId: keeper }, deps)).toMatchObject({
      ok: true,
    });
  });

  it("writes a person's request about their name to people.visibility (R-23)", async () => {
    const l = await league();
    const personId = await newPerson(pglite, l.leagueId);
    const registrar = await accountWith(l.leagueId, 'registrar');
    const scorekeeper = await accountWith(l.leagueId, 'scorekeeper');
    const input = { personId, version: 1, showAs: 'removed', reason: 'guardianAsked' };
    expect(await setNameRequest(l.as(scorekeeper), input, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(await setNameRequest(l.as(registrar), input, deps)).toEqual({
      ok: true,
      value: { version: 2 },
    });
    const row = await one<{ visibility: string; version: number }>(
      pglite,
      'select visibility, version from people where id = $1',
      [personId],
    );
    expect(row).toEqual({ visibility: 'removed', version: 2 });
    const logged = await one<{ details: unknown }>(
      pglite,
      "select details from activity_log where action = 'people.set_name_request' and target_id = $1",
      [personId],
    );
    expect(logged.details).toEqual({ showAs: 'removed', reason: 'guardianAsked' });
  });

  it("reads the person's age, the league's audience and its settings for initials (R-25)", async () => {
    const l = await league();
    const versionOf = async (personId: string) =>
      (
        await one<{ version: number }>(pglite, 'select version from people where id = $1', [
          personId,
        ])
      ).version;
    const ask = async (personId: string) =>
      setNameRequest(
        l.as(l.ownerId),
        { personId, version: await versionOf(personId), showAs: 'initials', reason: 'personAsked' },
        deps,
      );
    // A child: always. An adult (and, in this adult league, a person of unknown age): only
    // once the league lets adults ask.
    const child = await newSensitivePerson(l.leagueId);
    const adult = await newPerson(pglite, l.leagueId);
    expect(await ask(child)).toMatchObject({ ok: true });
    expect(await ask(adult)).toEqual({ ok: false, error: { code: 'initials-not-offered' } });
    await pglite.query(
      `insert into setting_values (league_id, level, key, value)
       values ($1, 'league', 'privacy.playersMayAskForInitials', '{"version": 1, "value": true}')`,
      [l.leagueId],
    );
    expect(await ask(adult)).toMatchObject({ ok: true });
    const rows = await pglite.query<{ visibility: string }>(
      'select visibility from people where id = any($1) order by id = $2 desc',
      [[child, adult], child],
    );
    expect(rows.rows.map((r) => r.visibility)).toEqual(['initials', 'initials']);
  });

  it("decides a child's initials by the database's answer on the league's own day (R-28)", async () => {
    // Kiritimati is 14 hours ahead of UTC and Pago Pago 11 behind: at any hour at least one
    // of them is on another day than UTC, so the server's day would answer otherwise.
    const utcToday = new Date().toISOString().slice(0, 10);
    const zones = ['Pacific/Kiritimati', 'Pacific/Pago_Pago'];
    const dayOf = (timeZone: string) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
    const yearsBefore = (day: string) =>
      `${String(Number(day.slice(0, 4)) - 18).padStart(4, '0')}${day.slice(4)}`;
    const nextDay = (day: string) => {
      const date = new Date(`${day}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() + 1);
      return date.toISOString().slice(0, 10);
    };
    let checked = 0;
    for (const zone of zones) {
      const leagueDay = dayOf(zone);
      // Unless the clock passed the zone's midnight while this ran.
      if (leagueDay === utcToday) continue;
      const l = await league();
      await pglite.query('update leagues set time_zone = $2 where id = $1', [l.leagueId, zone]);
      const born = async (birthDate: string, isMinor = false) => {
        const personId = await newPerson(pglite, l.leagueId);
        await pglite.query('update people set birth_date = $2, is_minor = $3 where id = $1', [
          personId,
          birthDate,
          isMinor,
        ]);
        return personId;
      };
      const ask = async (personId: string) => {
        const result = await setNameRequest(
          l.as(l.ownerId),
          {
            personId,
            version: (
              await one<{ version: number }>(pglite, 'select version from people where id = $1', [
                personId,
              ])
            ).version,
            showAs: 'initials',
            reason: 'guardianAsked',
          },
          deps,
        );
        return result.ok ? 'ok' : result.error.code;
      };
      // Eighteen today, the league's day: an adult, so initials are not offered to them
      // (an adult league, adults may not ask). Eighteen tomorrow there: still a child.
      // A birth date older than the league's today is never after the database's today,
      // so both can be saved.
      if (leagueDay > utcToday) {
        // Ahead of UTC: by the server's day this person is still 17, a child.
        expect(await ask(await born(yearsBefore(leagueDay))), zone).toBe('initials-not-offered');
      } else {
        // Behind UTC: by the server's day this person turned 18 today, an adult.
        expect(await ask(await born(yearsBefore(nextDay(leagueDay)))), zone).toBe('ok');
        expect(await ask(await born(yearsBefore(leagueDay))), zone).toBe('initials-not-offered');
      }
      // Eighteen tomorrow in the league: a child. Eighteen today with the tick on: a child.
      expect(await ask(await born(yearsBefore(nextDay(leagueDay)))), zone).toBe('ok');
      expect(await ask(await born(yearsBefore(leagueDay), true)), zone).toBe('ok');
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('lets a request show less, and only less, in an archived league (R-26)', async () => {
    const l = await league();
    const personId = await newPerson(pglite, l.leagueId);
    await pglite.query("update leagues set status = 'archived' where id = $1", [l.leagueId]);
    const removed = await setNameRequest(
      l.as(l.ownerId),
      { personId, version: 1, showAs: 'removed', reason: 'guardianAsked' },
      deps,
    );
    expect(removed).toEqual({ ok: true, value: { version: 2 } });
    expect(
      await setNameRequest(
        l.as(l.ownerId),
        { personId, version: 2, showAs: 'none', reason: 'leagueDecided' },
        deps,
      ),
    ).toMatchObject({ error: { code: 'not-allowed' } });
  });
});
