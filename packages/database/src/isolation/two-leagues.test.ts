// The two-league fixture gives the harness something to find in every table.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withUnfencedScope } from '../db/db.test-helper.ts';
import { transactionOf } from '../db/transaction-scope.ts';
import { footprints, readRows } from './database-rows.test-helper.ts';
import { openTwoLeagues, type TwoLeagues } from './two-leagues.test-helper.ts';

let leagues: TwoLeagues;
beforeAll(async () => {
  leagues = await openTwoLeagues();
});
afterAll(async () => {
  await leagues.close();
});

const count = async (text: string, params: unknown[]) =>
  (await leagues.pglite.query<{ n: number }>(`select count(*)::int as n from (${text}) x`, params))
    .rows[0]?.n;

describe('openTwoLeagues', () => {
  it('gives each league a row in every league table', async () => {
    const { rows } = await leagues.pglite.query<{ table_name: string }>(
      `select table_name from information_schema.columns
       where table_schema = 'public' and column_name = 'league_id'`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(9);
    for (const { table_name } of rows) {
      for (const { leagueId, marker } of [leagues.a, leagues.b]) {
        const n = await count(`select 1 from ${table_name} where league_id = $1`, [leagueId]);
        expect({ table_name, marker, some: (n ?? 0) > 0 }).toEqual({
          table_name,
          marker,
          some: true,
        });
      }
    }
  });

  it("gives each league's member a profile, and the shared account a role in both", async () => {
    for (const league of [leagues.a, leagues.b]) {
      expect(
        await count(
          `select 1 from profile_access pa join profiles p on p.id = pa.profile_id
           where pa.account_id = $1 and pa.relation = 'self' and p.id = $2`,
          [league.memberId, league.memberProfileId],
        ),
      ).toBe(1);
    }
    expect(
      await count('select distinct league_id from role_grants where account_id = $1', [
        leagues.sharedAccountId,
      ]),
    ).toBe(2);
    expect(
      await count('select 1 from profile_access where account_id = $1', [leagues.sharedAccountId]),
    ).toBe(2);
  });

  it("puts the league's marker in its texts, and neither marker in the shared account's", async () => {
    const texts = async (text: string, params: unknown[]) =>
      (await leagues.pglite.query<{ t: string }>(text, params)).rows.map((r) => r.t);
    for (const { leagueId, ownerId, marker } of [leagues.a, leagues.b]) {
      const found = [
        ...(await texts('select name as t from leagues where id = $1', [leagueId])),
        ...(await texts('select name as t from programs where league_id = $1', [leagueId])),
        ...(await texts('select name as t from seasons where league_id = $1', [leagueId])),
        ...(await texts('select name as t from divisions where league_id = $1', [leagueId])),
        ...(await texts('select name || address as t from venues where league_id = $1', [
          leagueId,
        ])),
        ...(await texts('select name as t from courts where league_id = $1', [leagueId])),
        ...(await texts('select name as t from teams where league_id = $1', [leagueId])),
        ...(await texts(
          `select first_name || coalesce(public_name, '') || coalesce(contact_email, '') as t
           from people where league_id = $1`,
          [leagueId],
        )),
        ...(await texts('select email || display_name as t from accounts where id = $1', [
          ownerId,
        ])),
        ...(await texts('select name as t from stages where league_id = $1', [leagueId])),
        ...(await texts('select label as t from rounds where league_id = $1', [leagueId])),
        ...(await texts(
          'select external_ref as t from games where league_id = $1 and external_ref is not null',
          [leagueId],
        )),
        ...(await texts('select reason as t from game_corrections where league_id = $1', [
          leagueId,
        ])),
      ];
      expect(found.length).toBe(17);
      for (const text of found) expect(text.toLowerCase()).toContain(marker);
    }
    const shared = await texts(
      `select a.email || a.display_name || p.first_name || p.last_name as t
       from accounts a join profile_access pa on pa.account_id = a.id
       join profiles p on p.id = pa.profile_id where a.id = $1`,
      [leagues.sharedAccountId],
    );
    expect(shared.some((text) => /alpha|bravo/i.test(text))).toBe(false);
  });

  it("lets the harness snapshot each league's people, teams and rosters as its own", async () => {
    const { a, b } = leagues;
    const rows = await withUnfencedScope(leagues.db, a.leagueId, async (s) =>
      readRows(transactionOf(s)),
    );
    const prints = footprints(
      rows,
      new Map([a, b].map((league) => [league.leagueId, league.marker])),
    );
    const { rows: child } = await leagues.pglite.query<{ profile_id: string }>(
      'select distinct profile_id from people where profile_id is not null',
    );
    // The shared child is a person in both leagues; their profile is neither's.
    expect(child.length).toBe(1);
    for (const league of [a, b]) {
      const own = prints.get(league.leagueId)?.rows;
      expect(own?.get('teams')).toContain(league.teamId);
      expect(own?.get('people')).toContain(league.personId);
      expect(own?.get('roster_entries')).toContain(league.rosterEntryId);
      expect(own?.get('profiles') ?? []).not.toContain(child[0]?.profile_id);
    }
  });

  it("lets the harness snapshot each league's schedule and games as its own", async () => {
    const { a, b } = leagues;
    const rows = await withUnfencedScope(leagues.db, a.leagueId, async (s) =>
      readRows(transactionOf(s)),
    );
    const prints = footprints(
      rows,
      new Map([a, b].map((league) => [league.leagueId, league.marker])),
    );
    for (const league of [a, b]) {
      const own = prints.get(league.leagueId)?.rows;
      expect(own?.get('stages')).toEqual([league.stageId]);
      expect(own?.get('rounds')).toEqual([league.roundId]);
      expect(own?.get('games')?.sort()).toEqual([league.gameId, league.upcomingGameId].sort());
      expect(own?.get('schedule_revisions')).toEqual([league.scheduleRevisionId]);
      expect(own?.get('schedule_drafts')).toEqual([league.scheduleDraftId]);
      expect(own?.get('game_assignments')).toEqual([league.gameAssignmentId]);
      expect(own?.get('game_corrections')?.length).toBe(1);
    }
  });
});
