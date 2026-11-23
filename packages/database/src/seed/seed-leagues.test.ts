import { PGlite } from '@electric-sql/pglite';
import { startingDesign } from '@srleagues/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations, pgliteDriver } from '../migrations/index.ts';
import { asApp } from '../schema/schema.test-helper.ts';
import { seedLeagues, seedStaff } from './seed-data.ts';
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

  it('has an adult league and a youth league, so names are seen shown both ways', () => {
    expect(seedLeagues.map((l) => l.audience).sort()).toEqual(['adult', 'youth']);
  });

  it('uses only addresses that cannot be real mailboxes', () => {
    for (const league of seedLeagues) {
      const emails = [
        league.owner.email,
        ...league.members.map((m) => m.email),
        ...league.people.flatMap((p) => (p.contactEmail === undefined ? [] : [p.contactEmail])),
      ];
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
        await pglite.query<{
          id: string;
          name: string;
          status: string;
          audience: string;
          owner: string;
        }>(
          `select l.id, l.name, l.status, l.audience, a.email as owner from leagues l
           join accounts a on a.id = l.owner_account_id where l.slug = $1`,
          [league.slug],
        )
      ).rows[0]!;
      expect(row).toMatchObject({
        name: league.name,
        status: 'live',
        audience: league.audience,
        owner: league.owner.email,
      });
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
      const season = await pglite.query<{ slug: string; name: string; is_current: boolean }>(
        'select slug, name, is_current from seasons where league_id = $1',
        [id],
      );
      expect(season.rows).toEqual([
        { slug: league.season.slug, name: league.season.name, is_current: true },
      ]);
      // Made with the league, in one step, by our staff (T-260), not by its owner.
      const madeBy = await pglite.query<{ action: string; email: string }>(
        `select a.action, ac.email from activity_log a join accounts ac on ac.id = a.actor_account_id
         where a.league_id = $1 and a.action in ('leagues.create', 'leagues.create_season')
         order by a.at, a.id`,
        [id],
      );
      expect(madeBy.rows).toEqual([
        { action: 'leagues.create', email: seedStaff.email },
        { action: 'leagues.create_season', email: seedStaff.email },
      ]);
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

  it('makes the other programs the data names, and limits a role to one where it says so', async () => {
    const limited = seedLeagues.flatMap((l) => l.members.filter((m) => m.program !== undefined));
    expect(limited.length).toBeGreaterThan(0);
    for (const league of seedLeagues) {
      const programs = await pglite.query<{ slug: string; name: string; is_default: boolean }>(
        `select p.slug, p.name, p.is_default from programs p join leagues l on l.id = p.league_id
         where l.slug = $1 and not p.is_default order by p.slug`,
        [league.slug],
      );
      expect(programs.rows).toEqual(
        (league.programs ?? []).map((p) => ({ slug: p.slug, name: p.name, is_default: false })),
      );
      const scopes = await pglite.query<{ email: string; scope_type: string; program: string }>(
        `select a.email, g.scope_type, coalesce(p.slug, '') as program
         from role_grants g join accounts a on a.id = g.account_id
         join leagues l on l.id = g.league_id
         left join programs p on p.league_id = g.league_id and p.id = g.scope_id
         where l.slug = $1 and g.revoked_at is null order by a.email`,
        [league.slug],
      );
      expect(scopes.rows).toEqual(
        league.members
          .map((m) => ({
            email: m.email,
            scope_type:
              m.team !== undefined ? 'team' : m.program === undefined ? 'league' : 'program',
            program: m.program ?? '',
          }))
          .sort((a, b) => a.email.localeCompare(b.email)),
      );
    }
  });

  it("gives a coach's role to the one team the data names (step 2.46)", async () => {
    const coaches = seedLeagues.flatMap((l) =>
      l.members.filter((m) => m.team !== undefined).map((m) => ({ league: l.slug, ...m })),
    );
    expect(coaches.length).toBeGreaterThan(0);
    for (const coach of coaches) {
      const rows = await pglite.query<{ team: string; role: string }>(
        `select t.slug as team, g.role from role_grants g join accounts a on a.id = g.account_id
         join leagues l on l.id = g.league_id
         join teams t on t.league_id = g.league_id and t.id = g.scope_id
         where l.slug = $1 and a.email = $2 and g.scope_type = 'team' and g.revoked_at is null`,
        [coach.league, coach.email],
      );
      expect(rows.rows, coach.email).toEqual([{ team: coach.team, role: coach.role }]);
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

describe("the seed leagues' designs (step 2.187)", () => {
  it('gives each league its own starting design as its first release, published by its owner', async () => {
    await seedLeaguesInto(pglite);
    for (const league of seedLeagues) {
      const { rows } = await pglite.query<{
        number: number;
        starting_design: string;
        design: unknown;
        by_owner: boolean;
        site_points: boolean;
      }>(
        `select r.number, r.starting_design, r.design,
           r.published_by_account_id = l.owner_account_id as by_owner,
           s.published_release_id = r.id as site_points
         from site_releases r
         join leagues l on l.id = r.league_id
         join sites s on s.league_id = r.league_id
         where l.slug = $1`,
        [league.slug],
      );
      expect(rows).toEqual([
        {
          number: 1,
          starting_design: league.design,
          design: startingDesign(league.design),
          by_owner: true,
          site_points: true,
        },
      ]);
    }
  });
});
