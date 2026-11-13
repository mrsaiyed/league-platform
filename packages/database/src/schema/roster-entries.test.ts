// T3 §7 and §12: a roster entry puts a person of the league on a team of the league
// (T-40), and while the season asks for it, no two people on a team wear one number.
import type { PGlite, Transaction } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asApp,
  freshSchema,
  newLeague,
  newPerson,
  newRosterEntry,
  newSeason,
  newTeam,
  one,
  refused,
} from './schema.test-helper.ts';

let db: PGlite;
beforeAll(async () => {
  db = await freshSchema();
});
afterAll(async () => {
  await db.close();
});

/** A league with a season and one team, ready for rosters. */
async function team() {
  const league = await newLeague(db);
  const seasonId = await newSeason(db, league.leagueId, league.defaultProgramId);
  const teamId = await newTeam(db, league.leagueId, seasonId);
  return { ...league, seasonId, teamId };
}

const set = (entry: string, column: string, value: unknown) =>
  db.query(`update roster_entries set ${column} = $1 where id = $2`, [value, entry]);

/** Switches the season's unique-jersey rule, as the season commands will: in its rules. */
const uniqueJerseys = (seasonId: string, on: boolean) =>
  db.query(
    `update seasons set rules = jsonb_set(
       jsonb_set(rules, '{rosters}', coalesce(rules -> 'rosters', '{}'::jsonb)),
       '{rosters,uniqueJerseys}', to_jsonb($1::boolean))
     where id = $2`,
    [on, seasonId],
  );

describe('roster entries', () => {
  it("cannot point at another league's team or person (T-40)", async () => {
    const a = await team();
    const b = await team();
    const ours = await newPerson(db, a.leagueId);
    const theirs = await newPerson(db, b.leagueId);
    await newRosterEntry(db, a.leagueId, a.teamId, ours);
    await expect(newRosterEntry(db, a.leagueId, b.teamId, ours)).rejects.toMatchObject({
      ...refused.foreignKey,
      constraint: 'roster_entries_team',
    });
    await expect(newRosterEntry(db, a.leagueId, a.teamId, theirs)).rejects.toMatchObject({
      ...refused.foreignKey,
      constraint: 'roster_entries_person',
    });
  });

  it("are refused just the same for the app's fenced role (T-60)", async () => {
    const a = await team();
    const b = await team();
    const theirs = await newPerson(db, b.leagueId);
    // As league A, B's rows are out of sight; the link still cannot be made.
    await expect(
      asApp(db, { league: a.leagueId }, (tx) => newRosterEntry(tx, a.leagueId, a.teamId, theirs)),
    ).rejects.toMatchObject({ ...refused.foreignKey, constraint: 'roster_entries_person' });
  });

  it('put a person on a team once at a time; after leaving they may join again', async () => {
    const { leagueId, teamId } = await team();
    const person = await newPerson(db, leagueId);
    const first = await newRosterEntry(db, leagueId, teamId, person);
    await expect(newRosterEntry(db, leagueId, teamId, person)).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'roster_entries_once',
    });
    await set(first, 'left_on', '2026-12-01');
    await newRosterEntry(db, leagueId, teamId, person);
  });

  it('take a jersey number from 0 to 99, or 00, or none', async () => {
    const { leagueId, teamId } = await team();
    const entry = await newRosterEntry(db, leagueId, teamId, await newPerson(db, leagueId));
    for (const jersey of ['0', '00', '7', '23', '99', null])
      await set(entry, 'jersey_number', jersey);
    for (const jersey of ['', '100', '07', '-1', '1.5', 'A', ' 7']) {
      await expect(set(entry, 'jersey_number', jersey)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'roster_entries_jersey_format',
      });
    }
  });

  it('have a role of player, captain or coach', async () => {
    const { leagueId, teamId } = await team();
    const entry = await newRosterEntry(db, leagueId, teamId, await newPerson(db, leagueId));
    for (const role of ['player', 'captain', 'coach']) await set(entry, 'role', role);
    for (const role of ['manager', 'Coach', '']) {
      await expect(set(entry, 'role', role)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'roster_entries_role',
      });
    }
  });

  it('leave on or after the day they joined, and sort by a number from 0 to 100000', async () => {
    const { leagueId, teamId } = await team();
    const entry = await newRosterEntry(db, leagueId, teamId, await newPerson(db, leagueId));
    await set(entry, 'joined_on', '2026-11-01');
    await set(entry, 'left_on', '2026-11-01');
    await expect(set(entry, 'left_on', '2026-10-31')).rejects.toMatchObject({
      ...refused.check,
      constraint: 'roster_entries_dates_in_order',
    });
    await set(entry, 'sort', 100000);
    await expect(set(entry, 'sort', -1)).rejects.toMatchObject({
      ...refused.check,
      constraint: 'roster_entries_sort_range',
    });
  });

  it('never move to another team or person: moving a player is leaving and joining', async () => {
    const { leagueId, seasonId, teamId } = await team();
    const entry = await newRosterEntry(db, leagueId, teamId, await newPerson(db, leagueId));
    const otherTeam = await newTeam(db, leagueId, seasonId);
    await expect(set(entry, 'team_id', otherTeam)).rejects.toMatchObject(refused.restrict);
    await expect(set(entry, 'person_id', await newPerson(db, leagueId))).rejects.toMatchObject(
      refused.restrict,
    );
  });
});

describe('unique jersey numbers in a team (T3 §12)', () => {
  it("follow the season's rules document, off unless it says true (T-44)", async () => {
    const { seasonId } = await team();
    const read = async () =>
      (
        await one<{ unique_jerseys: boolean }>(
          db,
          'select unique_jerseys from seasons where id = $1',
          [seasonId],
        )
      ).unique_jerseys;
    expect(await read()).toBe(false);
    await uniqueJerseys(seasonId, true);
    expect(await read()).toBe(true);
    await db.query(
      `update seasons set rules = jsonb_set(rules, '{rosters,uniqueJerseys}', '"true"') where id = $1`,
      [seasonId],
    );
    expect(await read()).toBe(false);
    // The column is worked out, never written.
    await expect(
      db.query('update seasons set unique_jerseys = true where id = $1', [seasonId]),
    ).rejects.toMatchObject({ code: '428C9' });
  });

  it('are not required while the season does not ask', async () => {
    const { leagueId, teamId } = await team();
    await newRosterEntry(db, leagueId, teamId, await newPerson(db, leagueId), { jersey: '23' });
    await newRosterEntry(db, leagueId, teamId, await newPerson(db, leagueId), { jersey: '23' });
  });

  it('refuse a second number on one team only while the season asks', async () => {
    const { leagueId, seasonId, teamId } = await team();
    await uniqueJerseys(seasonId, true);
    await newRosterEntry(db, leagueId, teamId, await newPerson(db, leagueId), { jersey: '23' });
    await expect(
      newRosterEntry(db, leagueId, teamId, await newPerson(db, leagueId), { jersey: '23' }),
    ).rejects.toMatchObject({ ...refused.unique, constraint: 'roster_entries_unique_jersey' });

    // 0 and 00 are different jerseys; no number clashes with nothing; another team may wear it.
    await newRosterEntry(db, leagueId, teamId, await newPerson(db, leagueId), { jersey: '0' });
    await newRosterEntry(db, leagueId, teamId, await newPerson(db, leagueId), { jersey: '00' });
    await newRosterEntry(db, leagueId, teamId, await newPerson(db, leagueId));
    await newRosterEntry(db, leagueId, teamId, await newPerson(db, leagueId));
    const otherTeam = await newTeam(db, leagueId, seasonId);
    await newRosterEntry(db, leagueId, otherTeam, await newPerson(db, leagueId), { jersey: '23' });

    // Switched off again, the number may be worn twice.
    await uniqueJerseys(seasonId, false);
    await newRosterEntry(db, leagueId, teamId, await newPerson(db, leagueId), { jersey: '23' });
  });

  it('free a number when its wearer leaves, and check it again on a change or a return', async () => {
    const { leagueId, seasonId, teamId } = await team();
    await uniqueJerseys(seasonId, true);
    const leaver = await newRosterEntry(db, leagueId, teamId, await newPerson(db, leagueId), {
      jersey: '5',
    });
    const other = await newRosterEntry(db, leagueId, teamId, await newPerson(db, leagueId), {
      jersey: '6',
    });
    await expect(set(other, 'jersey_number', '5')).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'roster_entries_unique_jersey',
    });
    await set(leaver, 'left_on', '2026-12-01');
    await set(other, 'jersey_number', '5');
    await expect(set(leaver, 'left_on', null)).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'roster_entries_unique_jersey',
    });
    // Saving an entry without touching its number is not a clash with itself.
    await set(other, 'sort', 3);
    await set(other, 'jersey_number', '5');
  });

  it('cannot be switched on while a team already has a number worn twice', async () => {
    const { leagueId, seasonId, teamId } = await team();
    const first = await newRosterEntry(db, leagueId, teamId, await newPerson(db, leagueId), {
      jersey: '11',
    });
    await newRosterEntry(db, leagueId, teamId, await newPerson(db, leagueId), { jersey: '11' });
    await expect(uniqueJerseys(seasonId, true)).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'seasons_unique_jerseys_clash',
    });
    await set(first, 'jersey_number', '12');
    await uniqueJerseys(seasonId, true);
  });

  it("hold for the app's fenced role (T-60)", async () => {
    const { leagueId, seasonId, teamId } = await team();
    await uniqueJerseys(seasonId, true);
    const people = [await newPerson(db, leagueId), await newPerson(db, leagueId)];
    await expect(
      asApp(db, { league: leagueId }, async (tx) => {
        for (const person of people) {
          await newRosterEntry(tx, leagueId, teamId, person, { jersey: '9' });
        }
      }),
    ).rejects.toMatchObject({ ...refused.unique, constraint: 'roster_entries_unique_jersey' });
  });

  it('switch the rule on for the fenced app role too, refused while a team has a clash', async () => {
    const { leagueId, seasonId, teamId } = await team();
    const first = await newRosterEntry(db, leagueId, teamId, await newPerson(db, leagueId), {
      jersey: '7',
    });
    await newRosterEntry(db, leagueId, teamId, await newPerson(db, leagueId), { jersey: '7' });
    const switchOn = () =>
      asApp(db, { league: leagueId }, (tx) =>
        tx.query(
          `update seasons set rules = '{"version": 1, "rosters": {"uniqueJerseys": true}}'
           where id = $1`,
          [seasonId],
        ),
      );
    await expect(switchOn()).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'seasons_unique_jerseys_clash',
    });
    await set(first, 'jersey_number', '8');
    await switchOn();
    const row = await one<{ unique_jerseys: boolean }>(
      db,
      'select unique_jerseys from seasons where id = $1',
      [seasonId],
    );
    expect(row.unique_jerseys).toBe(true);
  });

  it('refuse a number, or switching the rule on, unless the transaction is read committed', async () => {
    const { leagueId, seasonId, teamId } = await team();
    const inIsolation = (level: string, work: (tx: Transaction) => Promise<unknown>) =>
      db.transaction(async (tx) => {
        await tx.exec(`set transaction isolation level ${level}`);
        await work(tx);
      });
    const joins = async (tx: Transaction, jersey: string | null) =>
      newRosterEntry(tx, leagueId, teamId, await newPerson(tx, leagueId), { jersey });
    const isolation = { code: '25000', constraint: 'roster_entries_jersey_isolation' };
    for (const level of ['repeatable read', 'serializable']) {
      await expect(inIsolation(level, (tx) => joins(tx, '4'))).rejects.toMatchObject(isolation);
      await expect(
        inIsolation(level, (tx) =>
          tx.query(
            `update seasons set rules = '{"version": 1, "rosters": {"uniqueJerseys": true}}'
             where id = $1`,
            [seasonId],
          ),
        ),
      ).rejects.toMatchObject(isolation);
      // Without a number nothing is checked.
      await inIsolation(level, (tx) => joins(tx, null));
    }
    await inIsolation('read committed', (tx) => joins(tx, '4'));
  });
});
