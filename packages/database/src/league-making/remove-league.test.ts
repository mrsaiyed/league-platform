// Step 2.150's done test, on PGlite only (T-201): a draft league made by the tool is
// removed with its season and its unused owner account, and nothing else changes,
// in a second league or anywhere; a league that is used in any way is refused with
// nothing removed. Record 063 names each promise and the test below that keeps it.
import { PGlite } from '@electric-sql/pglite';
import { planNewLeague, type NewLeaguePlan } from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTransaction } from '../db/with-transaction.ts';
import { accountForSignIn } from '../queries/index.ts';
import {
  freshSchema,
  newAccount,
  newDivision,
  newGame,
  newPerson,
  newStage,
  newTeam,
  one,
  unique,
} from '../schema/schema.test-helper.ts';
import { openLeagueMakingTarget, type LeagueMakingTarget } from './league-making-target.ts';
import { makeLeague } from './make-league.ts';
import { previewLeagueRemoval, removeLeague } from './remove-league.ts';

let pglite: PGlite;
let target: LeagueMakingTarget;
beforeAll(async () => {
  pglite = await freshSchema();
  const opened = await openLeagueMakingTarget({ kind: 'pglite', pglite });
  if (!opened.ok) throw new Error(JSON.stringify(opened.problem));
  target = opened.target;
});
afterAll(async () => {
  await target.close();
  await pglite.close();
});

const staffEmail = 'remover.staff@example.test';

function planFor(change: Record<string, string> = {}): NewLeaguePlan {
  const result = planNewLeague({
    name: 'Made-up Hoops',
    shortName: unique('hoops'),
    sport: 'basketball',
    whoPlays: 'adults',
    city: 'Springfield',
    timeZone: 'America/Chicago',
    contactEmail: 'hello@example.test',
    ownerEmail: `${unique('owner')}@example.test`,
    seasonName: 'Fall 2026',
    staffEmail,
    ...change,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  return result.plan;
}

type Made = { leagueId: string; slug: string; seasonId: string; ownerAccountId: string };

/** A league made by the tool itself. */
async function made(change: Record<string, string> = {}): Promise<Made> {
  const plan = planFor(change);
  const outcome = await makeLeague(target, plan);
  if (!outcome.ok) throw new Error(JSON.stringify(outcome));
  return { ...outcome.made, slug: plan.slug };
}

/** What a plan shows of the league with this short name now (a league that is not there: nothing). */
async function shownNow(slug: string) {
  const { rows } = await pglite.query<{ id: string; version: number; created_at: string }>(
    'select id, version, created_at::text as created_at from leagues where slug = $1',
    [slug],
  );
  const row = rows[0];
  return row === undefined
    ? {
        leagueId: '01900000-0000-7000-8000-00000000dead',
        version: 1,
        createdAt: '2026-01-01 00:00:00+00',
      }
    : { leagueId: row.id, version: row.version, createdAt: row.created_at };
}

/** The tool's run: the plan shown just now, then the answer typed. */
const remove = async (
  league: { slug: string },
  typedSlug = league.slug,
  as = staffEmail,
  typedOwnerEmail: string | null = null,
) =>
  removeLeague(target, {
    slug: league.slug,
    staffEmail: as,
    typedSlug,
    shown: await shownNow(league.slug),
    typedOwnerEmail,
  });

/** Every row of every table in public and platform, as JSON text, table by table. */
async function everything(): Promise<Map<string, string[]>> {
  const { rows: tables } = await pglite.query<{ name: string }>(
    `select table_schema || '.' || table_name as name from information_schema.tables
     where table_schema in ('public', 'platform') and table_type = 'BASE TABLE' order by 1`,
  );
  const all = new Map<string, string[]>();
  for (const { name } of tables) {
    const { rows } = await pglite.query<{ row: string }>(
      `select to_jsonb(t)::text as row from ${name} t order by 1`,
    );
    all.set(
      name,
      rows.map((r) => r.row),
    );
  }
  return all;
}

/** The same reading without one league's rows (and, if given, one account's). */
function without(all: Map<string, string[]>, leagueId: string, accountId?: string) {
  const kept = new Map<string, string[]>();
  for (const [table, rows] of all) {
    kept.set(
      table,
      rows.filter((text) => {
        const row: Record<string, unknown> = JSON.parse(text);
        if (table === 'public.leagues') return row.id !== leagueId;
        if (table === 'public.accounts' && accountId !== undefined) return row.id !== accountId;
        return row.league_id !== leagueId;
      }),
    );
  }
  return kept;
}

const sameApartFromPlatformLog = (x: Map<string, string[]>, y: Map<string, string[]>) => {
  const strip = (m: Map<string, string[]>) =>
    new Map([...m].filter(([table]) => table !== 'platform.activity_log'));
  expect(strip(x)).toEqual(strip(y));
};

describe('removeLeague: the done test', () => {
  it('removes a draft league made by the tool, its season and its unused owner account, and nothing else', async () => {
    const first = await made();
    const second = await made();
    // The plan says what will go before anything does.
    const preview = await previewLeagueRemoval(target, { slug: first.slug, staffEmail });
    expect(preview).toMatchObject({
      ready: true,
      league: {
        leagueId: first.leagueId,
        slug: first.slug,
        name: 'Made-up Hoops',
        status: 'draft',
        seasons: ['Fall 2026'],
        madeByEmail: staffEmail,
        problems: [],
      },
      ownerKept: [],
    });
    // The season as the maker leaves it, which is all the removal lets through:
    // made, then made the current one.
    expect(
      await one(pglite, 'select version, is_current from seasons where id = $1', [first.seasonId]),
    ).toEqual({ version: 2, is_current: true });
    const before = await everything();
    // The maker wrote, for the first league: the league, its program, its season and
    // two activity-log entries, and the owner's account.
    for (const [table, count] of [
      ['public.leagues', 1],
      ['public.programs', 1],
      ['public.seasons', 1],
      ['public.activity_log', 2],
    ] as const) {
      const rows = (before.get(table) ?? []).filter((text) => {
        const row: Record<string, unknown> = JSON.parse(text);
        return (table === 'public.leagues' ? row.id : row.league_id) === first.leagueId;
      });
      expect({ table, rows: rows.length }).toEqual({ table, rows: count });
    }

    if (!preview.ready || preview.league === undefined) throw new Error('no plan');
    const outcome = await removeLeague(target, {
      slug: first.slug,
      staffEmail,
      typedSlug: first.slug,
      shown: {
        leagueId: preview.league.leagueId,
        version: preview.league.version,
        createdAt: preview.league.createdAt,
      },
      typedOwnerEmail: null,
    });
    expect(outcome).toMatchObject({
      ok: true,
      removed: {
        leagueId: first.leagueId,
        slug: first.slug,
        owner: { removed: true },
        readBack: {
          entry: {
            action: 'leagues.remove_draft',
            leagueId: first.leagueId,
            slug: first.slug,
            name: 'Made-up Hoops',
            actorEmail: staffEmail,
          },
          rowsLeft: 0,
          shortNameFree: true,
          ownerAccountThere: false,
        },
      },
    });

    // Every other row of every table, the second league's above all, is byte for byte
    // what it was; the platform log gained exactly one entry.
    const after = await everything();
    sameApartFromPlatformLog(after, without(before, first.leagueId, first.ownerAccountId));
    expect(after.get('platform.activity_log')?.length).toBe(
      (before.get('platform.activity_log')?.length ?? 0) + 1,
    );
    expect(
      await one(pglite, 'select count(*)::int as n from leagues where id = $1', [second.leagueId]),
    ).toEqual({ n: 1 });

    // The entry keeps what the league's own two log rows said, which went with it: who
    // made it and when, and who plays (ids, a time and a fixed word only).
    const madeRow = JSON.parse(
      (before.get('public.leagues') ?? []).find(
        (text) => (JSON.parse(text) as { id: string }).id === first.leagueId,
      ) ?? '{}',
    ) as { created_at: string; audience: string };
    const staff = await one<{ id: string }>(pglite, 'select id from accounts where email = $1', [
      staffEmail,
    ]);
    if (!outcome.ok) throw new Error('not removed');
    const entry = await one<{ details: Record<string, unknown>; same_time: boolean }>(
      pglite,
      `select details, (details ->> 'madeAt')::timestamptz = $2::timestamptz as same_time
       from platform.activity_log where id = $1`,
      [outcome.removed.logEntryId, madeRow.created_at],
    );
    expect(entry.details).toEqual({
      ownerAccountId: first.ownerAccountId,
      madeByAccountId: staff.id,
      madeAt: expect.any(String),
      audience: 'adult',
    });
    expect(entry.same_time).toBe(true);
    expect(madeRow.audience).toBe('adult');
  });

  it('never removes a league the plan did not show: one removed and made again meanwhile (area 5, M1)', async () => {
    const slug = unique('school-league');
    const wrong = await made({ shortName: slug, ownerEmail: `${slug}.owner@example.test` });
    // Terminal 1: the plan shows the wrong league, and its question waits.
    const plan = await previewLeagueRemoval(target, { slug, staffEmail });
    if (!plan.ready || plan.league === undefined) throw new Error('no plan');
    expect(plan.league.leagueId).toBe(wrong.leagueId);
    const shown = {
      leagueId: plan.league.leagueId,
      version: plan.league.version,
      createdAt: plan.league.createdAt,
    };
    // Terminal 2: it is removed and made again, right this time, under the same name.
    expect((await remove({ slug })).ok).toBe(true);
    const right = await made({
      shortName: slug,
      ownerEmail: `${slug}.owner@example.test`,
      whoPlays: 'under-18s',
    });
    const before = await everything();
    // Terminal 1 answers the question it was asked about the wrong league.
    expect(
      await removeLeague(target, {
        slug,
        staffEmail,
        typedSlug: slug,
        shown,
        typedOwnerEmail: null,
      }),
    ).toEqual({ ok: false, problem: { kind: 'changed-since-plan' } });
    expect(await everything()).toEqual(before);
    expect(
      await one(pglite, 'select count(*)::int as n from leagues where id = $1', [right.leagueId]),
    ).toEqual({ n: 1 });
  });

  it('refuses when the league changed after the plan, or the plan names another league', async () => {
    const league = await made();
    const other = await made();
    const shown = await shownNow(league.slug);
    await pglite.query("update leagues set name = 'Renamed meanwhile' where id = $1", [
      league.leagueId,
    ]);
    const before = await everything();
    const answer = { slug: league.slug, staffEmail, typedSlug: league.slug, typedOwnerEmail: null };
    expect(await removeLeague(target, { ...answer, shown })).toEqual({
      ok: false,
      problem: { kind: 'changed-since-plan' },
    });
    expect(await removeLeague(target, { ...answer, shown: await shownNow(other.slug) })).toEqual({
      ok: false,
      problem: { kind: 'changed-since-plan' },
    });
    expect(await everything()).toEqual(before);
  });

  it('says the league is not there on a second run, and changes nothing', async () => {
    const league = await made();
    expect((await remove(league)).ok).toBe(true);
    const before = await everything();
    expect(await previewLeagueRemoval(target, { slug: league.slug, staffEmail })).toEqual({
      ready: true,
      league: undefined,
    });
    expect(await remove(league)).toEqual({ ok: false, problem: { kind: 'not-found' } });
    expect(await everything()).toEqual(before);
  });

  it('stops with nothing changed when the short name typed is not the league’s own, exactly', async () => {
    const league = await made();
    const before = await everything();
    for (const typed of [league.slug.toUpperCase(), ` ${league.slug}`, `${league.slug}x`, '']) {
      expect(await remove(league, typed)).toEqual({
        ok: false,
        problem: { kind: 'short-name-differs' },
      });
    }
    expect(await everything()).toEqual(before);
  });

  it('removes nothing for an email with no account: the tool makes none', async () => {
    const league = await made();
    const before = await everything();
    expect(await remove(league, league.slug, 'nobody.here@example.test')).toEqual({
      ok: false,
      problem: { kind: 'staff-unknown' },
    });
    expect(await everything()).toEqual(before);
  });
});

/** Ways a league is used; each must be refused with nothing removed. */
const uses: [string, (league: Made) => Promise<unknown>, string][] = [
  [
    'one game',
    async (league) => {
      const stage = await newStage(pglite, league.leagueId, league.seasonId);
      const home = await newTeam(pglite, league.leagueId, league.seasonId);
      const away = await newTeam(pglite, league.leagueId, league.seasonId);
      return newGame(pglite, {
        leagueId: league.leagueId,
        seasonId: league.seasonId,
        stageId: stage,
        homeTeamId: home,
        awayTeamId: away,
      });
    },
    'rows:public.games',
  ],
  ['one person', (league) => newPerson(pglite, league.leagueId), 'rows:public.people'],
  [
    'a second role',
    async (league) =>
      pglite.query(
        "insert into role_grants (league_id, account_id, role) values ($1, $2, 'admin')",
        [league.leagueId, await newAccount(pglite)],
      ),
    'rows:public.role_grants',
  ],
  [
    'an ended role',
    async (league) =>
      pglite.query(
        `insert into role_grants (league_id, account_id, role, revoked_at)
         values ($1, $2, 'scorekeeper', now() + interval '1 second')`,
        [league.leagueId, await newAccount(pglite)],
      ),
    'rows:public.role_grants',
  ],
  [
    'published',
    (league) => pglite.query("update leagues set status = 'live' where id = $1", [league.leagueId]),
    'state:live',
  ],
  [
    'archived',
    (league) =>
      pglite.query("update leagues set status = 'archived' where id = $1", [league.leagueId]),
    'state:archived',
  ],
  [
    'suspended',
    (league) =>
      pglite.query("update leagues set status = 'suspended' where id = $1", [league.leagueId]),
    'state:suspended',
  ],
  [
    'in the bin itself',
    (league) =>
      pglite.query('update leagues set deleted_at = now() where id = $1', [league.leagueId]),
    'in-bin',
  ],
  [
    'renamed',
    (league) =>
      pglite.query("update leagues set name = 'Renamed' where id = $1", [league.leagueId]),
    'league-changed',
  ],
  [
    'something in its bin',
    async (league) => {
      const division = await newDivision(pglite, league.leagueId, league.seasonId);
      return pglite.query('update divisions set deleted_at = now() where id = $1', [division]);
    },
    'rows:public.divisions',
  ],
  [
    'an invitation waiting',
    (league) =>
      pglite.query(
        `insert into invitations (league_id, email, role, token_hash, expires_at)
         values ($1, 'invitee@example.test', 'editor', repeat('a', 64), now() + interval '7 days')`,
        [league.leagueId],
      ),
    'rows:public.invitations',
  ],
  [
    'a setting saved',
    (league) =>
      pglite.query(
        `insert into setting_values (league_id, level, key, value)
         values ($1, 'league', 'members.startPage', '{"version": 1, "value": "myTeam"}')`,
        [league.leagueId],
      ),
    'rows:public.setting_values',
  ],
  [
    'its season published',
    (league) =>
      pglite.query("update seasons set status = 'active' where id = $1", [league.seasonId]),
    'season-changed',
  ],
  [
    'its season made not current',
    (league) =>
      pglite.query('update seasons set is_current = false where id = $1', [league.seasonId]),
    'season-changed',
  ],
  [
    'its season’s rules saved',
    (league) =>
      pglite.query(`update seasons set rules = '{"version": 1, "periods": 4}' where id = $1`, [
        league.seasonId,
      ]),
    'season-changed',
  ],
  [
    'a second season',
    async (league) => {
      const { rows } = await pglite.query<{ program_id: string }>(
        'select program_id from seasons where id = $1',
        [league.seasonId],
      );
      return pglite.query(
        `insert into seasons (league_id, program_id, slug, name) values ($1, $2, 'spring', 'Spring')`,
        [league.leagueId, rows[0]?.program_id],
      );
    },
    'season-changed',
  ],
  [
    // The tool gives the league its site and first release (step 2.187): those may go,
    // a changed site may not.
    'its site’s design changed',
    (league) =>
      pglite.query(`update sites set starting_design = 'crest-light' where league_id = $1`, [
        league.leagueId,
      ]),
    'site-changed',
  ],
  [
    'an activity-log entry by someone else',
    async (league) =>
      pglite.query(
        `insert into activity_log (league_id, actor_account_id, action, summary)
         values ($1, $2, 'leagues.set_name', 'activity.leagues.set_name')`,
        [league.leagueId, await newAccount(pglite)],
      ),
    'activity',
  ],
  [
    'an activity-log entry by the maker of anything else',
    async (league) => {
      const { rows } = await pglite.query<{ id: string }>(
        'select id from accounts where lower(email) = lower($1)',
        [staffEmail],
      );
      return pglite.query(
        `insert into activity_log (league_id, actor_account_id, action, summary)
         values ($1, $2, 'access.invite', 'activity.access.invite')`,
        [league.leagueId, rows[0]?.id],
      );
    },
    'activity',
  ],
  [
    'a former short name still forwarding',
    (league) =>
      pglite.query(
        `insert into league_slug_history (league_id, old_slug, expires_at)
         values ($1, $2, now() + interval '1 year')`,
        [league.leagueId, unique('old-name')],
      ),
    'rows:public.league_slug_history',
  ],
  [
    'a job waiting',
    (league) =>
      pglite.query(`insert into jobs (league_id, type) values ($1, 'notify.event')`, [
        league.leagueId,
      ]),
    'rows:public.jobs',
  ],
];

describe('removeLeague refuses a league that is used, with nothing removed', () => {
  it.each(uses)('refuses a league with %s', async (_name, use, word) => {
    const league = await made();
    await use(league);
    const before = await everything();
    const preview = await previewLeagueRemoval(target, { slug: league.slug, staffEmail });
    expect(preview).toMatchObject({ ready: true, league: { leagueId: league.leagueId } });
    const outcome = await remove(league);
    expect(outcome).toMatchObject({ ok: false, problem: { kind: 'in-use' } });
    if (outcome.ok || outcome.problem.kind !== 'in-use') return;
    const words = outcome.problem.found.map((f) =>
      f.kind === 'rows' ? `rows:${f.table}` : f.kind === 'state' ? `state:${f.state}` : f.kind,
    );
    expect(words).toContain(word);
    expect(await everything()).toEqual(before);
  });

  it('checks again when it removes, not only in the plan: a person added after the plan is seen', async () => {
    const league = await made();
    const preview = await previewLeagueRemoval(target, { slug: league.slug, staffEmail });
    expect(preview).toMatchObject({ ready: true, league: { problems: [] } });
    const shown = await shownNow(league.slug);
    await newPerson(pglite, league.leagueId);
    const before = await everything();
    expect(
      await removeLeague(target, {
        slug: league.slug,
        staffEmail,
        typedSlug: league.slug,
        shown,
        typedOwnerEmail: null,
      }),
    ).toMatchObject({
      ok: false,
      problem: { kind: 'in-use', found: [{ kind: 'rows', table: 'public.people', count: 1 }] },
    });
    expect(await everything()).toEqual(before);
  });
});

describe('the owner’s account: removed only when the database shows nobody ever used it', () => {
  it('keeps it when someone has signed in with it', async () => {
    const league = await made({ ownerEmail: 'signed.in.owner@example.test' });
    await withTransaction(target.db, {}, (scope) =>
      accountForSignIn(scope, 'made-up-sign-in-remover-1', 'signed.in.owner@example.test'),
    );
    expect(await previewLeagueRemoval(target, { slug: league.slug, staffEmail })).toMatchObject({
      ownerKept: ['signed-in', 'used'],
    });
    // The short name alone is not enough once the owner has signed in: the owner's
    // email must be typed too, exactly (area 5, M3).
    const before = await everything();
    for (const typed of [null, 'Signed.In.Owner@example.test', 'signed.in.owner@example.tes']) {
      expect(await remove(league, league.slug, staffEmail, typed)).toEqual({
        ok: false,
        problem: { kind: 'owner-email-differs' },
      });
    }
    expect(await everything()).toEqual(before);
    expect(
      await remove(league, league.slug, staffEmail, 'signed.in.owner@example.test'),
    ).toMatchObject({
      ok: true,
      removed: {
        owner: { removed: false, kept: ['signed-in', 'used'] },
        readBack: { ownerAccountThere: true },
      },
    });
  });

  it('needs no email for an owner who has never signed in', async () => {
    const league = await made();
    expect(await remove(league, league.slug, staffEmail, null)).toMatchObject({ ok: true });
  });

  it('keeps it when it owns another league', async () => {
    const owner = 'two.leagues.owner@example.test';
    const first = await made({ ownerEmail: owner });
    await made({ ownerEmail: owner });
    expect(await remove(first)).toMatchObject({
      ok: true,
      removed: { owner: { removed: false, kept: ['owns-league'] } },
    });
  });

  it('keeps it when it holds a role in another league', async () => {
    const league = await made();
    const other = await made();
    await pglite.query(
      "insert into role_grants (league_id, account_id, role) values ($1, $2, 'editor')",
      [other.leagueId, league.ownerAccountId],
    );
    expect(await remove(league)).toMatchObject({
      ok: true,
      removed: { owner: { removed: false, kept: ['has-roles'] } },
    });
  });

  it('keeps it when it is our staff member’s own account', async () => {
    const league = await made({ ownerEmail: staffEmail });
    expect(await remove(league)).toMatchObject({
      ok: true,
      removed: { owner: { removed: false, kept: ['is-staff'] } },
    });
  });

  it('keeps it when it has a name or was last seen: it changed after it was made', async () => {
    const league = await made();
    await pglite.query("update accounts set display_name = 'Someone' where id = $1", [
      league.ownerAccountId,
    ]);
    expect(await remove(league)).toMatchObject({
      ok: true,
      removed: { owner: { removed: false, kept: ['used'] } },
    });
  });
});

describe('removeLeague when a login may not do its part', () => {
  it('refuses before the plan and again before anything is removed', async () => {
    const league = await made();
    const own: LeagueMakingTarget = { ...target, appLogin: 'own' };
    const before = await everything();
    const refusal = {
      kind: 'login',
      problems: [
        {
          login: 'app',
          problems: expect.arrayContaining([
            'postgres is a superuser: alter role postgres nosuperuser',
          ]),
        },
      ],
    };
    expect(await previewLeagueRemoval(own, { slug: league.slug, staffEmail })).toEqual({
      ready: false,
      problem: refusal,
    });
    expect(
      await removeLeague(own, {
        slug: league.slug,
        staffEmail,
        typedSlug: league.slug,
        shown: await shownNow(league.slug),
        typedOwnerEmail: null,
      }),
    ).toEqual({ ok: false, problem: refusal });
    expect(await everything()).toEqual(before);
  });
});

describe('removeLeague when something unexpected stops it', () => {
  it('says the league is still there, whole, and never throws', async () => {
    const league = await made();
    let calls = 0;
    // The removal's own transaction fails before it does anything.
    const broken: LeagueMakingTarget = {
      ...target,
      login: {
        ...target.login,
        transaction: async () => {
          calls += 1;
          throw Object.assign(new Error('made-up: connection reset'), { code: 'ECONNRESET' });
        },
      },
    };
    const before = await everything();
    expect(
      await removeLeague(broken, {
        slug: league.slug,
        staffEmail,
        typedSlug: league.slug,
        shown: await shownNow(league.slug),
        typedOwnerEmail: null,
      }),
    ).toEqual({
      ok: false,
      problem: { kind: 'failed', league: 'not-removed', reason: 'ECONNRESET' },
    });
    expect(calls).toBe(1);
    expect(await everything()).toEqual(before);
  });
});
