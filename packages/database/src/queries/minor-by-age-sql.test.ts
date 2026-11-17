// R-28 in SQL (minor-by-age-sql.ts) gives core's answers (isMinorOn) on every case core's
// own test has, and more; it reads the person's own league's today in that league's time
// zone; and each query that says whether someone is a child (the public roster, the
// people for the name function, whether the league has a recorded child) reads it so,
// never returning the birth date.
import type { PGlite } from '@electric-sql/pglite';
import { dayIn, defaultNamePolicy, isMinorOn, publicViewer } from '@srleagues/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { withTransaction } from '../db/with-transaction.ts';
import {
  freshSchema,
  newLeague,
  newPerson,
  newRosterEntry,
  newSeason,
  newTeam,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { hasRecordedChild } from './has-recorded-child.ts';
import { listPeopleForDisplay } from './list-people-for-display.ts';
import { listPublicRoster } from './list-public-roster.ts';
import { isMinorSql } from './minor-by-age-sql.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let a: MadeLeague;

beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  a = await newLeague(pglite);
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

/** yyyy-mm-dd, `days` days on from `day`. */
function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
const yearsBefore = (day: string, years: number) =>
  `${String(Number(day.slice(0, 4)) - years).padStart(4, '0')}${day.slice(4)}`;

/** The SQL's answer for these facts on `today`, over a row named `people` made of values. */
async function sqlAnswer(birthDate: string | null, isMinor: boolean | null, today: string) {
  const { rows } = await withTransaction(db, { leagueId: a.leagueId }, (scope) =>
    sql<{ minor: boolean | null }>`
      select ${isMinorSql(sql<string>`${today}::date`)} as minor
        from (values (${birthDate}::date, ${isMinor}::boolean, ${a.leagueId}::uuid))
          as people (birth_date, is_minor, league_id)`.execute(transactionOf(scope)),
  );
  return rows[0]?.minor;
}

describe('isMinorSql gives what core gives (R-28)', () => {
  const todays = [
    '2026-11-16',
    '2026-02-28',
    '2026-03-01',
    '2024-02-28',
    '2024-02-29',
    '2026-12-31',
  ];
  const births = [
    null,
    '1990-04-12',
    '2012-09-03',
    '2008-11-16',
    '2008-11-17',
    '2008-02-29',
    '2004-02-29',
    '2006-02-28',
    '2006-03-01',
    '2008-12-31',
    '2009-01-01',
    // After every today above: a child, as core counts it (it cannot be saved).
    '2030-01-01',
    // A birth year mistyped far in the past: an adult's date, which unticks no one.
    '1912-09-03',
  ];
  const ticks = [true, false, null];
  const cases = todays.flatMap((today) =>
    births.flatMap((birthDate) => ticks.map((isMinor) => ({ today, birthDate, isMinor }))),
  );

  it(`answers each of ${cases.length} cases as isMinorOn does`, async () => {
    const differ: string[] = [];
    for (const { today, birthDate, isMinor } of cases) {
      const core = isMinorOn({ birthDate, isMinor }, today);
      const database = await sqlAnswer(birthDate, isMinor, today);
      if (database !== core)
        differ.push(`${birthDate} ${isMinor} on ${today}: ${database} v ${core}`);
    }
    expect(differ).toEqual([]);
  });

  it('keeps a ticked person a child whatever adult date they have, as core does', async () => {
    for (const birthDate of ['1990-04-12', '1912-09-03', '2008-11-16']) {
      expect(await sqlAnswer(birthDate, true, '2026-11-16'), birthDate).toBe(true);
      expect(isMinorOn({ birthDate, isMinor: true }, '2026-11-16'), birthDate).toBe(true);
    }
  });

  it('counts a date it cannot read against a today as a child, tick on or off', async () => {
    // A date column holds no unreadable text; the database's counterpart is a comparison
    // with no answer, as when no league row gives a today: a child, as core counts a date it
    // cannot read.
    for (const isMinor of [true, false, null]) {
      const { rows } = await withTransaction(db, { leagueId: a.leagueId }, (scope) =>
        sql<{ minor: boolean | null }>`
          select ${isMinorSql(sql<string>`null::date`)} as minor
            from (values ('1990-04-12'::date, ${isMinor}::boolean, ${a.leagueId}::uuid))
              as people (birth_date, is_minor, league_id)`.execute(transactionOf(scope)),
      );
      expect(rows[0]?.minor, String(isMinor)).toBe(true);
      for (const unreadable of ['12/09/2012', '2012-02-30', '']) {
        expect(isMinorOn({ birthDate: unreadable, isMinor }, '2026-11-16')).toBe(true);
      }
    }
    // And a person whose league row the subquery cannot find: a child too.
    const { rows } = await withTransaction(db, { leagueId: a.leagueId }, (scope) =>
      sql<{ minor: boolean | null }>`
        select ${isMinorSql()} as minor
          from (values ('1990-04-12'::date, false, gen_random_uuid()))
            as people (birth_date, is_minor, league_id)`.execute(transactionOf(scope)),
    );
    expect(rows[0]?.minor).toBe(true);
  });
});

describe("isMinorSql reads the person's own league's today, in its time zone", () => {
  it('finds the same birth date a child in one league and an adult in another', async () => {
    // Kiritimati is 14 hours ahead of UTC and Pago Pago 11 behind: never the same day.
    const east = await newLeague(pglite);
    const west = await newLeague(pglite);
    await pglite.query(`update leagues set time_zone = 'Pacific/Kiritimati' where id = $1`, [
      east.leagueId,
    ]);
    await pglite.query(`update leagues set time_zone = 'Pacific/Pago_Pago' where id = $1`, [
      west.leagueId,
    ]);
    // Eighteen today in Kiritimati: already a day or two later than in Pago Pago.
    const eastToday = dayIn('Pacific/Kiritimati', Date.now());
    const birthDate = yearsBefore(eastToday, 18);
    const answerIn = async (league: MadeLeague) => {
      const person = await newPerson(pglite, league.leagueId);
      await pglite.query('update people set birth_date = $2, is_minor = null where id = $1', [
        person,
        birthDate,
      ]);
      const rows = await withTransaction(db, { leagueId: league.leagueId }, (scope) =>
        listPeopleForDisplay(scope, [person]),
      );
      return rows[0]?.isMinor;
    };
    // Unless the clock passed a midnight in Kiritimati during the test.
    if (dayIn('Pacific/Kiritimati', Date.now()) !== eastToday) return;
    expect(await answerIn(east)).toBe(false);
    expect(await answerIn(west)).toBe(true);
  });
});

describe('the queries that say whether someone is a child read it through isMinorSql', () => {
  let child: string;
  let grown: string;
  let ticked: string;
  let teamId: string;

  beforeAll(async () => {
    const seasonId = await newSeason(pglite, a.leagueId, a.defaultProgramId);
    await pglite.query(`update seasons set status = 'active' where id = $1`, [seasonId]);
    teamId = await newTeam(pglite, a.leagueId, seasonId);
    const today = dayIn('America/Chicago', Date.now());
    child = await newPerson(pglite, a.leagueId, { firstName: 'Kit', lastName: 'Young' });
    grown = await newPerson(pglite, a.leagueId, { firstName: 'Ada', lastName: 'Grown' });
    ticked = await newPerson(pglite, a.leagueId, { firstName: 'Tia', lastName: 'Ticked' });
    // A child by birth date with the tick off; an adult by birth date with the tick off;
    // an adult by birth date with the tick on, a child (a date unticks no one).
    await pglite.query('update people set birth_date = $2, is_minor = false where id = $1', [
      child,
      yearsBefore(addDays(today, 1), 18),
    ]);
    await pglite.query('update people set birth_date = $2, is_minor = false where id = $1', [
      grown,
      yearsBefore(today, 18),
    ]);
    await pglite.query('update people set birth_date = $2, is_minor = true where id = $1', [
      ticked,
      yearsBefore(today, 18),
    ]);
    for (const person of [child, grown, ticked]) {
      await newRosterEntry(pglite, a.leagueId, teamId, person);
    }
  });

  const inA = <T>(work: (scope: LeagueScope) => Promise<T>) =>
    withTransaction(db, { leagueId: a.leagueId }, work);

  it('the people for the name function: a yes or a no, never the date', async () => {
    const rows = await inA((scope) => listPeopleForDisplay(scope, [child, grown, ticked]));
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(child)?.isMinor).toBe(true);
    expect(byId.get(grown)?.isMinor).toBe(false);
    expect(byId.get(ticked)?.isMinor).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("the public roster: an adult league's child by birth date by first name and initial", async () => {
    const roster = await inA((scope) =>
      listPublicRoster(scope, teamId, {
        viewer: publicViewer(a.leagueId),
        policy: defaultNamePolicy,
      }),
    );
    const names = roster.lines.map((line) => (line.name.shown ? line.name.text : line.name.why));
    expect(names).toEqual(expect.arrayContaining(['Kit Y.', 'Ada Grown', 'Tia T.']));
    expect(JSON.stringify(roster)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('whether the league has a recorded child: by birth date or by the tick', async () => {
    const other = await newLeague(pglite);
    const recorded = () =>
      withTransaction(db, { leagueId: other.leagueId }, (scope) => hasRecordedChild(scope));
    const today = dayIn('America/Chicago', Date.now());
    const person = await newPerson(pglite, other.leagueId);
    // An adult by birth date, the tick off: none.
    await pglite.query('update people set birth_date = $2, is_minor = false where id = $1', [
      person,
      yearsBefore(today, 18),
    ]);
    expect(await recorded()).toBe(false);
    // The same date with the tick on: one (a date unticks no one).
    await pglite.query('update people set is_minor = true where id = $1', [person]);
    expect(await recorded()).toBe(true);
    // A child by birth date, the tick off: one.
    await pglite.query('update people set birth_date = $2, is_minor = false where id = $1', [
      person,
      yearsBefore(addDays(today, 1), 18),
    ]);
    expect(await recorded()).toBe(true);
    // No date: the tick decides, as before.
    await pglite.query('update people set birth_date = null, is_minor = true where id = $1', [
      person,
    ]);
    expect(await recorded()).toBe(true);
    await pglite.query('update people set is_minor = false where id = $1', [person]);
    expect(await recorded()).toBe(false);
  });

  it('reads no other league: the people of another league are not there', async () => {
    const other = await newLeague(pglite);
    const rows = await withTransaction(db, { leagueId: other.leagueId }, (scope) =>
      listPeopleForDisplay(scope, [child, grown]),
    );
    expect(rows).toEqual([]);
  });
});
