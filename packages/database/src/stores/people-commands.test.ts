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

  it('searches by name, public name and (for those who may see it) email, and pages', async () => {
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
    expect(await names(l.ownerId, { search: 'bo@example' })).toEqual(['Adams']);
    expect(await names(l.ownerId, { search: '%' })).toEqual(['Percent%']);
    expect(await names(l.ownerId, { limit: 1, offset: 1 })).toEqual(['Baker']);
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
      // An email finds nothing for this reader, though it finds the person for one who may see it.
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
    const withEmail = await listPeople(l.as(l.ownerId), { search: 'test@example' }, deps);
    expect(withEmail).toMatchObject({ value: [{ id: personId }] });
  });
});
