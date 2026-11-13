import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations, pgliteDriver } from '../migrations/index.ts';
import { asApp } from '../schema/schema.test-helper.ts';
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

const countIn = async (db: PGlite, text: string) =>
  (await db.query<{ n: number }>(text)).rows[0]!.n;
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

describe('what each seeded league holds', () => {
  it('has one season and, for every member, exactly the role the data names', async () => {
    for (const league of seedLeagues) {
      const id = (
        await pglite.query<{ id: string }>('select id from leagues where slug = $1', [league.slug])
      ).rows[0]!.id;
      expect(await count('select count(*)::int as n from seasons where league_id = $1', [id])).toBe(
        1,
      );
      const season = await pglite.query<{ slug: string; name: string }>(
        'select slug, name from seasons where league_id = $1',
        [id],
      );
      expect(season.rows).toEqual([{ slug: league.season.slug, name: league.season.name }]);
      const grants = await pglite.query<{ email: string; role: string }>(
        `select a.email, g.role from role_grants g join accounts a on a.id = g.account_id
         where g.league_id = $1 and g.revoked_at is null order by a.email`,
        [id],
      );
      expect(grants.rows).toEqual(
        league.members
          .map((m) => ({ email: m.email, role: m.role }))
          .sort((a, b) => a.email.localeCompare(b.email)),
      );
    }
  });

  it('shows a league only its own teams and people when scoped to it', async () => {
    const ids = new Map<string, string>();
    for (const league of seedLeagues) {
      ids.set(
        league.slug,
        (
          await pglite.query<{ id: string }>('select id from leagues where slug = $1', [
            league.slug,
          ])
        ).rows[0]!.id,
      );
    }
    for (const league of seedLeagues) {
      const other = seedLeagues.find((l) => l !== league)!;
      const seen = await asApp(pglite, { league: ids.get(league.slug)! }, async (tx) => ({
        teams: (await tx.query<{ name: string }>('select name from teams')).rows.map((r) => r.name),
        people: (
          await tx.query<{ first_name: string; last_name: string }>(
            'select first_name, last_name from people',
          )
        ).rows.map((r) => `${r.first_name} ${r.last_name}`),
      }));
      const own = league.divisions.flatMap((d) => d.teams.map((t) => t.name));
      const foreign = other.divisions.flatMap((d) => d.teams.map((t) => t.name));
      expect(seen.teams.sort()).toEqual(own.sort());
      for (const name of foreign) expect(seen.teams).not.toContain(name);
      expect(seen.people.sort()).toEqual(
        league.people.map((p) => `${p.firstName} ${p.lastName}`).sort(),
      );
    }
  });
});

describe('a load that stops part-way', () => {
  it('is reported on the next run, never as already there', async () => {
    const fresh = new PGlite();
    try {
      const run = await applyMigrations(pgliteDriver(fresh));
      if (!run.ok) throw new Error(run.error.message);
      const base = seedLeagues[1]!;
      // Two teams with one short name: the second is refused after the league exists.
      const broken = {
        ...base,
        slug: 'broken-seed',
        divisions: [
          { name: 'Open', teams: [base.divisions[0]!.teams[0]!, base.divisions[0]!.teams[0]!] },
        ],
      };
      await expect(seedLeaguesInto(fresh, [broken])).rejects.toThrow(/Seeding failed at team/);
      expect(
        await countIn(fresh, "select count(*)::int as n from leagues where slug = 'broken-seed'"),
      ).toBe(1);
      await expect(seedLeaguesInto(fresh, [broken])).rejects.toThrow(/only partly loaded/);
    } finally {
      await fresh.close();
    }
  });
});
