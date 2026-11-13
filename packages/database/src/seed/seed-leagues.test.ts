import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations, pgliteDriver } from '../migrations/index.ts';
import { seedLeagues } from './seed-data.ts';
import { seedLeaguesInto } from './seed-leagues.ts';

let pglite: PGlite;
beforeAll(async () => {
  pglite = new PGlite();
  const run = await applyMigrations(pgliteDriver(pglite));
  if (!run.ok) throw new Error(run.error.message);
});
afterAll(async () => {
  await pglite.close();
});

const count = async (text: string, params: unknown[] = []) =>
  (await pglite.query<{ n: number }>(text, params)).rows[0]!.n;

describe('seed data', () => {
  it('has two leagues with different designs', () => {
    expect(seedLeagues).toHaveLength(2);
    expect(new Set(seedLeagues.map((l) => l.design)).size).toBe(2);
  });

  it('uses only addresses that cannot be real mailboxes', () => {
    for (const league of seedLeagues) {
      const emails = [league.owner.email, ...league.members.map((m) => m.email)];
      for (const email of emails) expect(email).toMatch(/@[a-z.]*example\.test$/);
    }
  });

  it('gives each league its own admin and members', () => {
    const emails = seedLeagues.flatMap((l) => [l.owner.email, ...l.members.map((m) => m.email)]);
    expect(new Set(emails).size).toBe(emails.length);
    for (const league of seedLeagues)
      expect(league.members.some((m) => m.role === 'admin')).toBe(true);
  });
});

describe('seedLeaguesInto', () => {
  it('loads both leagues, live, with their people, teams and grants', async () => {
    const loaded = await seedLeaguesInto(pglite);
    expect(loaded.map((l) => l.created)).toEqual([true, true]);
    for (const league of seedLeagues) {
      const row = (
        await pglite.query<{ id: string; name: string; status: string; owner: string }>(
          `select l.id, l.name, l.status, a.email as owner from leagues l
           join accounts a on a.id = l.owner_account_id where l.slug = $1`,
          [league.slug],
        )
      ).rows[0]!;
      expect(row).toMatchObject({ name: league.name, status: 'live', owner: league.owner.email });
      const teams = league.divisions.reduce((n, d) => n + d.teams.length, 0);
      expect(
        await count('select count(*)::int as n from teams where league_id = $1', [row.id]),
      ).toBe(teams);
      expect(
        await count('select count(*)::int as n from divisions where league_id = $1', [row.id]),
      ).toBe(league.divisions.length);
      expect(
        await count('select count(*)::int as n from people where league_id = $1', [row.id]),
      ).toBe(league.people.length);
      expect(
        await count(
          'select count(*)::int as n from role_grants where league_id = $1 and revoked_at is null',
          [row.id],
        ),
      ).toBe(league.members.length);
    }
  });

  it('keeps one league away from the other: a member holds a role in one league only', async () => {
    const [first, second] = seedLeagues;
    const n = await count(
      `select count(*)::int as n from role_grants g join accounts a on a.id = g.account_id
       join leagues l on l.id = g.league_id
       where a.email = $1 and l.slug = $2`,
      [first!.members[0]!.email, second!.slug],
    );
    expect(n).toBe(0);
  });

  it('is safe to run again: nothing is added twice', async () => {
    const before = await count('select count(*)::int as n from teams');
    const again = await seedLeaguesInto(pglite);
    expect(again.map((l) => l.created)).toEqual([false, false]);
    expect(await count('select count(*)::int as n from teams')).toBe(before);
  });
});
