// T3 §3: a person as one league knows them, linked to a profile once claimed (R-3),
// and erased in place on request (R-17, T-52).
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshSchema, newLeague, newPerson, one, refused } from './schema.test-helper.ts';

let db: PGlite;
beforeAll(async () => {
  db = await freshSchema();
});
afterAll(async () => {
  await db.close();
});

const newProfile = async () =>
  (
    await one<{ id: string }>(
      db,
      "insert into profiles (first_name, last_name) values ('Made-up', 'Profile') returning id",
    )
  ).id;

const set = (person: string, column: string, value: unknown) =>
  db.query(`update people set ${column} = $1 where id = $2`, [value, person]);

describe('people', () => {
  it('are added by hand with no profile, and linked to one later (R-3)', async () => {
    const { leagueId } = await newLeague(db);
    const person = await newPerson(db, leagueId);
    const row = await one<{ profile_id: string | null; visibility: string; is_minor: null }>(
      db,
      'select profile_id, visibility, is_minor from people where id = $1',
      [person],
    );
    expect(row).toEqual({ profile_id: null, visibility: 'none', is_minor: null });
    await set(person, 'profile_id', await newProfile());
  });

  it('link a profile to one person in a league, and to one in each other league', async () => {
    const a = await newLeague(db);
    const b = await newLeague(db);
    const profile = await newProfile();
    const first = await newPerson(db, a.leagueId, { profileId: profile });
    await expect(newPerson(db, a.leagueId, { profileId: profile })).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'people_profile_once',
    });
    await newPerson(db, b.leagueId, { profileId: profile });

    // A person in the bin lets the link go.
    await set(first, 'deleted_at', new Date());
    await newPerson(db, a.leagueId, { profileId: profile });
  });

  it('are merged only into a person of the same league, never into themselves', async () => {
    const a = await newLeague(db);
    const b = await newLeague(db);
    const kept = await newPerson(db, a.leagueId);
    const duplicate = await newPerson(db, a.leagueId);
    await set(duplicate, 'merged_into_id', kept);
    await expect(set(kept, 'merged_into_id', kept)).rejects.toMatchObject({
      ...refused.check,
      constraint: 'people_not_merged_into_self',
    });
    const theirs = await newPerson(db, b.leagueId);
    await expect(set(duplicate, 'merged_into_id', theirs)).rejects.toMatchObject({
      ...refused.foreignKey,
      constraint: 'people_merged_into',
    });
  });

  it('ask for nothing, initials, or to be off public pages (R-15, R-17)', async () => {
    const { leagueId } = await newLeague(db);
    const person = await newPerson(db, leagueId);
    for (const value of ['none', 'initials', 'removed']) await set(person, 'visibility', value);
    for (const value of ['hidden', 'NONE', '']) {
      await expect(set(person, 'visibility', value)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'people_visibility',
      });
    }
  });

  it('have names of at most 100 characters, and a public name of 1 to 100', async () => {
    const { leagueId } = await newLeague(db);
    const person = await newPerson(db, leagueId);
    await set(person, 'first_name', 'x'.repeat(100));
    await set(person, 'last_name', 'x'.repeat(100));
    for (const column of ['first_name', 'last_name']) {
      await expect(set(person, column, 'x'.repeat(101))).rejects.toMatchObject({
        ...refused.check,
        constraint: `people_${column}_length`,
      });
    }
    await set(person, 'public_name', 'Big Mo');
    await set(person, 'public_name', null);
    for (const name of ['', '  ', 'x'.repeat(101)]) {
      await expect(set(person, 'public_name', name)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'people_public_name_length',
      });
    }
  });

  it('have a contact email that looks like one and a plausible birth date, or none', async () => {
    const { leagueId } = await newLeague(db);
    const person = await newPerson(db, leagueId);
    await set(person, 'contact_email', 'parent@example.test');
    await set(person, 'birth_date', '2012-05-01');
    await expect(set(person, 'contact_email', 'not an email')).rejects.toMatchObject({
      ...refused.check,
      constraint: 'people_contact_email_format',
    });
    await expect(set(person, 'birth_date', '1899-12-31')).rejects.toMatchObject({
      ...refused.check,
      constraint: 'people_birth_date_plausible',
    });
  });

  it('are erased in place: the row and its id stay, nothing personal is left (T-52)', async () => {
    const { leagueId } = await newLeague(db);
    const person = await newPerson(db, leagueId, { profileId: await newProfile() });
    await db.query(
      `update people set contact_email = 'p@example.test', birth_date = '2010-01-01',
         public_name = 'Nick', is_minor = true where id = $1`,
      [person],
    );
    await db.query(
      `update people set first_name = '', last_name = '', public_name = null,
         contact_email = null, birth_date = null, profile_id = null where id = $1`,
      [person],
    );
    const row = await one<Record<string, unknown>>(
      db,
      `select first_name, last_name, public_name, contact_email, birth_date, profile_id
       from people where id = $1`,
      [person],
    );
    expect(row).toEqual({
      first_name: '',
      last_name: '',
      public_name: null,
      contact_email: null,
      birth_date: null,
      profile_id: null,
    });
  });
});
