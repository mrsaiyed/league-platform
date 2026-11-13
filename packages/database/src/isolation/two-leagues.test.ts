// The two-league fixture gives the harness something to find in every table.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
        ...(await texts('select email || display_name as t from accounts where id = $1', [
          ownerId,
        ])),
      ];
      expect(found.length).toBe(5);
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
});
