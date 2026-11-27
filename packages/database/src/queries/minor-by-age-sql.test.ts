// R-28 in SQL (minor-by-age-sql.ts) gives core's answers (isMinorOn) on every case core's
// own test has, and more; it reads the person's own league's today in that league's time
// zone; and each query that says whether someone is a child (the public roster, the
// people for the name function, whether the league has a recorded child) reads it so,
// never returning the birth date.
import type { PGlite } from '@electric-sql/pglite';
import {
  dayIn,
  defaultNamePolicy,
  isMinorOn,
  publicViewer,
  tickedButGrownOn,
} from '@srleagues/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { withTransaction } from '../db/with-transaction.ts';
import {
  freshSchema,
  newGame,
  newLeague,
  newPerson,
  newRosterEntry,
  newSeason,
  newStage,
  newTeam,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { findPerson } from './find-person.ts';
import { hasRecordedChild } from './has-recorded-child.ts';
import { hasWalkUpOfUnknownAge } from './has-walk-up-of-unknown-age.ts';
import { listPeopleForDisplay } from './list-people-for-display.ts';
import { listPublicRoster } from './list-public-roster.ts';
import { listPeople } from './list-people.ts';
import { isMinorSql, recordedOnly, tickedButGrownSql } from './minor-by-age-sql.ts';

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
const notAtTable = { addedAtTable: false };
const yearsBefore = (day: string, years: number) =>
  `${String(Number(day.slice(0, 4)) - years).padStart(4, '0')}${day.slice(4)}`;

/** The SQL's answer for these facts on `today`, over a row named `people` made of values. */
async function sqlAnswer(
  birthDate: string | null,
  isMinor: boolean | null,
  today: string,
  addedAtTable = false,
) {
  const { rows } = await withTransaction(db, { leagueId: a.leagueId }, (scope) =>
    sql<{ minor: boolean | null }>`
      select ${isMinorSql({
        today: sql<string>`${today}::date`,
        addedAtTable: sql<boolean>`${addedAtTable}::boolean`,
      })} as minor
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
  // S-136: and whether they were typed in at a scorer's table.
  const cases = todays.flatMap((today) =>
    births.flatMap((birthDate) =>
      ticks.flatMap((isMinor) =>
        [false, true].map((addedAtTable) => ({ today, birthDate, isMinor, addedAtTable })),
      ),
    ),
  );

  it(`answers each of ${cases.length} cases as isMinorOn does`, async () => {
    const differ: string[] = [];
    for (const { today, birthDate, isMinor, addedAtTable } of cases) {
      const core = isMinorOn({ birthDate, isMinor }, today, { addedAtTable });
      const database = await sqlAnswer(birthDate, isMinor, today, addedAtTable);
      if (database !== core)
        differ.push(`${birthDate} ${isMinor} ${addedAtTable} on ${today}: ${database} v ${core}`);
    }
    expect(differ).toEqual([]);
  });

  it('finds who is ticked but 18 or over as tickedButGrownOn does (step 2.146)', async () => {
    const differ: string[] = [];
    for (const { today, birthDate, isMinor, addedAtTable } of cases) {
      if (addedAtTable) continue;
      const core = tickedButGrownOn({ birthDate, isMinor }, today);
      const { rows } = await withTransaction(db, { leagueId: a.leagueId }, (scope) =>
        sql<{ grown: boolean }>`
          select ${tickedButGrownSql(sql<string>`${today}::date`)} as grown
            from (values (${birthDate}::date, ${isMinor}::boolean))
              as people (birth_date, is_minor)`.execute(transactionOf(scope)),
      );
      if (rows[0]?.grown !== core) differ.push(`${birthDate} ${isMinor} on ${today}`);
    }
    expect(differ).toEqual([]);
  });

  it('keeps a ticked person a child whatever adult date they have, as core does', async () => {
    for (const birthDate of ['1990-04-12', '1912-09-03', '2008-11-16']) {
      expect(await sqlAnswer(birthDate, true, '2026-11-16'), birthDate).toBe(true);
      expect(isMinorOn({ birthDate, isMinor: true }, '2026-11-16', notAtTable), birthDate).toBe(
        true,
      );
    }
  });

  it('counts a date it cannot read against a today as a child, tick on or off', async () => {
    // A date column holds no unreadable text; the database's counterpart is a comparison
    // with no answer, as when no league row gives a today: a child, as core counts a date it
    // cannot read.
    for (const isMinor of [true, false, null]) {
      const { rows } = await withTransaction(db, { leagueId: a.leagueId }, (scope) =>
        sql<{ minor: boolean | null }>`
          select ${isMinorSql({ today: sql<string>`null::date`, addedAtTable: recordedOnly })} as minor
            from (values ('1990-04-12'::date, ${isMinor}::boolean, ${a.leagueId}::uuid))
              as people (birth_date, is_minor, league_id)`.execute(transactionOf(scope)),
      );
      expect(rows[0]?.minor, String(isMinor)).toBe(true);
      for (const unreadable of ['12/09/2012', '2012-02-30', '']) {
        expect(isMinorOn({ birthDate: unreadable, isMinor }, '2026-11-16', notAtTable)).toBe(true);
      }
    }
    // And a person whose league row the subquery cannot find: a child too.
    const { rows } = await withTransaction(db, { leagueId: a.leagueId }, (scope) =>
      sql<{ minor: boolean | null }>`
        select ${isMinorSql()} as minor
          from (values ('1990-04-12'::date, false, gen_random_uuid(), gen_random_uuid()))
            as people (birth_date, is_minor, league_id, id)`.execute(transactionOf(scope)),
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

  it("counts a player typed in at a scorer's table with no age as a child, until an admin says (S-136)", async () => {
    const b = await newLeague(pglite);
    const seasonId = await newSeason(pglite, b.leagueId, b.defaultProgramId);
    await pglite.query(`update seasons set status = 'active' where id = $1`, [seasonId]);
    const stageId = await newStage(pglite, b.leagueId, seasonId);
    const home = await newTeam(pglite, b.leagueId, seasonId);
    const away = await newTeam(pglite, b.leagueId, seasonId);
    const gameId = await newGame(pglite, {
      leagueId: b.leagueId,
      seasonId,
      stageId,
      homeTeamId: home,
      awayTeamId: away,
    });
    const walkUp = await newPerson(pglite, b.leagueId, { firstName: 'Wal', lastName: 'Kup' });
    const listed = await newPerson(pglite, b.leagueId, { firstName: 'Lis', lastName: 'Ted' });
    // As the scorer's table adds them (insert-table-player.ts): marked as added at the game.
    await pglite.query(
      `insert into roster_entries (league_id, team_id, person_id, role, added_at_game_id)
       values ($1, $2, $3, 'player', $4)`,
      [b.leagueId, home, walkUp, gameId],
    );
    await newRosterEntry(pglite, b.leagueId, home, listed);
    const inB = <T>(work: (scope: LeagueScope) => Promise<T>) =>
      withTransaction(db, { leagueId: b.leagueId }, work);
    const seen = async () => {
      const rows = await inB((scope) => listPeopleForDisplay(scope, [walkUp, listed]));
      const roster = await inB((scope) =>
        listPublicRoster(scope, home, {
          viewer: publicViewer(b.leagueId),
          policy: defaultNamePolicy,
        }),
      );
      // S-136, the closing round: the parents' confirmation never covers a walk-up.
      const confirmed = await inB((scope) =>
        listPublicRoster(scope, home, {
          viewer: publicViewer(b.leagueId),
          policy: { ...defaultNamePolicy, childrenInFull: true },
        }),
      );
      return {
        minor: rows.find((row) => row.id === walkUp)?.isMinor,
        walkUpForName: rows.find((row) => row.id === walkUp)?.walkUp,
        names: roster.lines.map((line) => (line.name.shown ? line.name.text : line.name.why)),
        confirmedNames: confirmed.lines.map((line) =>
          line.name.shown ? line.name.text : line.name.why,
        ),
        recorded: await inB((scope) => hasRecordedChild(scope)),
        // S-136 as amended (the fix round): the Privacy screen's fact, Admin → People's
        // list of walk-ups with no age, and the walk-up's own record.
        walkUpFact: await inB((scope) => hasWalkUpOfUnknownAge(scope)),
        walkUpList: (
          await inB((scope) =>
            listPeople(scope, { limit: 10, offset: 0, sensitive: true, walkUps: true }),
          )
        ).map((row) => row.id),
        onRecord: (await inB((scope) => findPerson(scope, walkUp, true)))?.sensitive?.walkUp,
      };
    };
    // No date and no tick: the walk-up is a child in this adult league; the person put on
    // the roster by an admin is not known, so shown as the league shows adults. Neither is
    // a recorded child (S-109 reads what an admin recorded).
    expect(await seen()).toEqual({
      minor: true,
      walkUpForName: true,
      names: expect.arrayContaining(['Wal K.', 'Lis Ted']),
      confirmedNames: expect.arrayContaining(['Wal K.', 'Lis Ted']),
      recorded: false,
      walkUpFact: true,
      walkUpList: [walkUp],
      onRecord: true,
    });
    // The admin says otherwise: the tick off ("an adult"), or a date that says adult. The
    // walk-up rule then no longer applies: off the list, off the record, off Privacy.
    await pglite.query('update people set is_minor = false where id = $1', [walkUp]);
    expect(await seen()).toMatchObject({
      minor: false,
      walkUpForName: undefined,
      names: expect.arrayContaining(['Wal Kup']),
      walkUpFact: false,
      walkUpList: [],
      onRecord: undefined,
    });
    await pglite.query('update people set is_minor = null, birth_date = $2 where id = $1', [
      walkUp,
      '1990-04-12',
    ]);
    expect(await seen()).toMatchObject({ minor: false, walkUpFact: false, walkUpList: [] });
    // Or the tick on: a recorded child now.
    await pglite.query('update people set is_minor = true, birth_date = null where id = $1', [
      walkUp,
    ]);
    expect(await seen()).toMatchObject({
      minor: true,
      walkUpForName: undefined,
      // A recorded child now: the confirmation covers them.
      confirmedNames: expect.arrayContaining(['Wal Kup']),
      recorded: true,
      walkUpFact: false,
      walkUpList: [],
      onRecord: undefined,
    });
  });

  it('lists only those ticked as children who are 18 or over by birth date (step 2.146)', async () => {
    const c = await newLeague(pglite);
    const today = dayIn('America/Chicago', Date.now());
    const made = async (firstName: string, birthDate: string | null, isMinor: boolean | null) => {
      const id = await newPerson(pglite, c.leagueId, { firstName, lastName: 'Finder' });
      await pglite.query('update people set birth_date = $2, is_minor = $3 where id = $1', [
        id,
        birthDate,
        isMinor,
      ]);
      return id;
    };
    const grownTicked = await made('Grown', yearsBefore(today, 18), true);
    await made('Young', yearsBefore(addDays(today, 1), 18), true);
    await made('Unticked', yearsBefore(today, 30), false);
    await made('Undated', null, true);
    const found = await withTransaction(db, { leagueId: c.leagueId }, (scope) =>
      listPeople(scope, { limit: 10, offset: 0, sensitive: true, tickedButGrown: true }),
    );
    expect(found.map((person) => person.id)).toEqual([grownTicked]);
    const everyone = await withTransaction(db, { leagueId: c.leagueId }, (scope) =>
      listPeople(scope, { limit: 10, offset: 0, sensitive: false }),
    );
    expect(everyone).toHaveLength(4);
  });

  it('reads no other league: the people of another league are not there', async () => {
    const other = await newLeague(pglite);
    const rows = await withTransaction(db, { leagueId: other.leagueId }, (scope) =>
      listPeopleForDisplay(scope, [child, grown]),
    );
    expect(rows).toEqual([]);
  });
});
