// The leagues module's step 1.11 commands against the real database: each call is one
// transaction (commandTransaction), committed on success and rolled back on a refusal.
// Also covers the queries behind them (their isolation cases are in ../isolation).
import type { PGlite } from '@electric-sql/pglite';
import {
  createLeague,
  createSeason,
  renameShortName,
  setCurrentSeason,
  setLeagueStatus,
  type CommandDeps,
  type Job,
  type LeaguesTx,
} from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import {
  freshSchema,
  newAccount,
  newLeague,
  newSeason,
  one,
  unique,
} from '../schema/schema.test-helper.ts';
import { accessStore } from './access-store.ts';
import { activityLogStore } from './activity-log-store.ts';
import { divisionsStore } from './divisions-store.ts';
import { leaguesStore } from './leagues-store.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let staffId: string;
let deps: CommandDeps<LeaguesTx>;
beforeAll(async () => {
  pglite = await freshSchema();
  staffId = await newAccount(pglite);
  db = createDatabase({ kind: 'pglite', pglite });
  deps = {
    transaction: commandTransaction(db, (scope) => ({
      jobs: { enqueue: async (_job: Job) => {} },
      leagues: leaguesStore(scope, { platformStaff: [staffId] }),
      divisions: divisionsStore(scope),
      access: accessStore(scope),
      activity: activityLogStore(scope),
    })),
    events: [],
    log: () => {},
    now: () => 0,
  };
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

const newId = async () => (await one<{ id: string }>(pglite, 'select uuid_v7() as id')).id;
const as = (leagueId: string, accountId: string) => ({ leagueId, accountId, requestId: 'r-1' });
const row = (leagueId: string) =>
  one<{ slug: string; status: string; version: number; listed: boolean }>(
    pglite,
    'select slug, status, version, listed from leagues where id = $1',
    [leagueId],
  );
const countOf = async (text: string, params: unknown[]) =>
  (await one<{ n: number }>(pglite, text, params)).n;

async function create(slug: string, change: object = {}) {
  const ownerAccountId = await newAccount(pglite);
  const leagueId = await newId();
  const result = await createLeague(
    as(leagueId, staffId),
    {
      slug,
      name: 'Made-up Hoops',
      timeZone: 'America/Chicago',
      audience: 'adult',
      ownerAccountId,
      sportKey: 'basketball',
      ...change,
    },
    deps,
  );
  return { result, leagueId, ownerAccountId };
}

describe('createLeague on the database', () => {
  it('creates a draft league and its one default program together', async () => {
    const { result, leagueId, ownerAccountId } = await create(unique('hoops'));
    expect(result).toMatchObject({
      ok: true,
      value: { id: leagueId, status: 'draft', version: 1, ownerAccountId },
    });
    expect(await row(leagueId)).toMatchObject({ status: 'draft', listed: true });
    expect(
      await countOf('select count(*)::int as n from programs where league_id = $1 and is_default', [
        leagueId,
      ]),
    ).toBe(1);
  });

  it('lists youth leagues only when told to (U-10)', async () => {
    const youth = await create(unique('youth'), { audience: 'youth' });
    expect(await row(youth.leagueId)).toMatchObject({ listed: false });
    const listed = await create(unique('youth'), { audience: 'youth', listed: true });
    expect(await row(listed.leagueId)).toMatchObject({ listed: true });
  });

  it('refuses anyone who is not our staff, creating nothing', async () => {
    const ownerAccountId = await newAccount(pglite);
    const leagueId = await newId();
    const input = {
      slug: unique('hoops'),
      name: 'X',
      timeZone: 'UTC',
      audience: 'adult',
      ownerAccountId,
      sportKey: 'basketball',
    };
    expect(await createLeague(as(leagueId, ownerAccountId), input, deps)).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
    expect(await countOf('select count(*)::int as n from leagues where id = $1', [leagueId])).toBe(
      0,
    );
  });

  it('refuses a taken short name, a blocked one, an unknown owner and a used id', async () => {
    const first = await create(unique('hoops'));
    const slug = (await row(first.leagueId)).slug;
    expect(await create(slug)).toMatchObject({ result: { error: { code: 'short-name-taken' } } });
    expect(await create('admin')).toMatchObject({
      result: { error: { code: 'short-name-blocked' } },
    });
    const stranger = await newId();
    expect(await create(unique('hoops'), { ownerAccountId: stranger })).toMatchObject({
      result: { error: { code: 'owner-not-found' } },
    });
    const again = await createLeague(
      as(first.leagueId, staffId),
      {
        slug: unique('hoops'),
        name: 'X',
        timeZone: 'UTC',
        audience: 'adult',
        ownerAccountId: first.ownerAccountId,
        sportKey: 'basketball',
      },
      deps,
    );
    expect(again).toMatchObject({ error: { code: 'league-exists' } });
    // Nothing from the refusals stayed: the league table holds only what succeeded.
    expect(await row(first.leagueId)).toMatchObject({ slug });
  });

  it('keeps a short name that forwards to another league away from a new league', async () => {
    const owner = await create(unique('hoops'));
    const oldSlug = (await row(owner.leagueId)).slug;
    const renamed = await renameShortName(
      as(owner.leagueId, owner.ownerAccountId),
      { slug: unique('renamed'), version: 1 },
      deps,
    );
    expect(renamed).toMatchObject({ ok: true });
    expect(await create(oldSlug)).toMatchObject({
      result: { error: { code: 'short-name-taken' } },
    });
  });
});

describe('renameShortName on the database', () => {
  it('renames, keeps the old name forwarding for 12 months, and bumps the version', async () => {
    const owner = await create(unique('hoops'));
    const oldSlug = (await row(owner.leagueId)).slug;
    const slug = unique('renamed');
    const result = await renameShortName(
      as(owner.leagueId, owner.ownerAccountId),
      { slug, version: 1 },
      deps,
    );
    expect(result).toEqual({ ok: true, value: { slug, version: 2 } });
    expect(await row(owner.leagueId)).toMatchObject({ slug, version: 2 });
    const history = await one<{ old_slug: string; months: number }>(
      pglite,
      `select old_slug, round(extract(epoch from (expires_at - created_at)) / 86400 / 30)::int as months
       from league_slug_history where league_id = $1`,
      [owner.leagueId],
    );
    expect(history).toEqual({ old_slug: oldSlug, months: 12 });
    const found = await one<{ league_id: string; slug: string; forwarded: boolean }>(
      pglite,
      'select league_id, slug, forwarded from find_league_by_slug($1)',
      [oldSlug],
    );
    expect(found).toEqual({ league_id: owner.leagueId, slug, forwarded: true });
  });

  it('refuses a name another league holds, or whose forwarding is held, changing nothing', async () => {
    const a = await create(unique('hoops'));
    const b = await create(unique('hoops'));
    const aSlug = (await row(a.leagueId)).slug;
    const bSlug = (await row(b.leagueId)).slug;
    const asB = as(b.leagueId, b.ownerAccountId);
    expect(await renameShortName(asB, { slug: aSlug, version: 1 }, deps)).toMatchObject({
      error: { code: 'short-name-taken' },
    });
    // A moves away; B may not take A's old name while it forwards to A.
    await renameShortName(
      as(a.leagueId, a.ownerAccountId),
      { slug: unique('moved'), version: 1 },
      deps,
    );
    expect(await renameShortName(asB, { slug: aSlug, version: 1 }, deps)).toMatchObject({
      error: { code: 'short-name-taken' },
    });
    expect(await row(b.leagueId)).toMatchObject({ slug: bSlug, version: 1 });
    expect(
      await countOf('select count(*)::int as n from league_slug_history where league_id = $1', [
        b.leagueId,
      ]),
    ).toBe(0);
  });

  it('lets a league take back its own old name, and refuses a stale version', async () => {
    const a = await create(unique('hoops'));
    const original = (await row(a.leagueId)).slug;
    const asA = as(a.leagueId, a.ownerAccountId);
    await renameShortName(asA, { slug: unique('moved'), version: 1 }, deps);
    expect(await renameShortName(asA, { slug: original, version: 2 }, deps)).toMatchObject({
      ok: true,
    });
    expect(await renameShortName(asA, { slug: unique('late'), version: 2 }, deps)).toMatchObject({
      error: { code: 'changed-since-read' },
    });
  });
});

describe('setLeagueStatus on the database', () => {
  it('moves along the table: owner publishes, staff suspend and lift', async () => {
    const a = await create(unique('hoops'));
    const owner = as(a.leagueId, a.ownerAccountId);
    const staff = as(a.leagueId, staffId);
    expect(await setLeagueStatus(owner, { status: 'live', version: 1 }, deps)).toMatchObject({
      ok: true,
    });
    expect(await setLeagueStatus(owner, { status: 'suspended', version: 2 }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(await setLeagueStatus(staff, { status: 'suspended', version: 2 }, deps)).toMatchObject({
      ok: true,
    });
    expect(await row(a.leagueId)).toMatchObject({ status: 'suspended', version: 3 });
    expect(await setLeagueStatus(owner, { status: 'draft', version: 3 }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(await setLeagueStatus(staff, { status: 'draft', version: 3 }, deps)).toMatchObject({
      ok: true,
    });
  });
});

describe('seasons on the database', () => {
  it('creates a draft season in the default program and makes one current at a time', async () => {
    const a = await create(unique('hoops'));
    const owner = as(a.leagueId, a.ownerAccountId);
    const first = await createSeason(owner, { slug: 'fall-2026', name: 'Fall 2026' }, deps);
    const second = await createSeason(owner, { slug: 'winter-2027', name: 'Winter' }, deps);
    if (!first.ok || !second.ok) throw new Error('seasons were not created');
    const state = () =>
      pglite
        .query<{
          slug: string;
          status: string;
          is_current: boolean;
        }>('select slug, status, is_current from seasons where league_id = $1 order by slug', [
          a.leagueId,
        ])
        .then((r) => r.rows);
    expect(await state()).toEqual([
      { slug: 'fall-2026', status: 'draft', is_current: false },
      { slug: 'winter-2027', status: 'draft', is_current: false },
    ]);
    await setCurrentSeason(owner, { seasonId: first.value.seasonId }, deps);
    await setCurrentSeason(owner, { seasonId: second.value.seasonId }, deps);
    expect((await state()).map((s) => s.is_current)).toEqual([false, true]);
  });

  it('refuses a repeated season short name and an unknown program', async () => {
    const a = await create(unique('hoops'));
    const owner = as(a.leagueId, a.ownerAccountId);
    await createSeason(owner, { slug: 'fall', name: 'Fall' }, deps);
    expect(await createSeason(owner, { slug: 'fall', name: 'Again' }, deps)).toMatchObject({
      error: { code: 'season-slug-taken' },
    });
    const missing = await newId();
    expect(
      await createSeason(owner, { slug: 'x-y', name: 'X', programId: missing }, deps),
    ).toMatchObject({ error: { code: 'program-not-found' } });
  });

  it('never reaches another league, even with its season id', async () => {
    const other = await newLeague(pglite);
    const otherProgram = other.defaultProgramId;
    const otherSeason = await newSeason(pglite, other.leagueId, otherProgram, { isCurrent: true });
    const a = await create(unique('hoops'));
    const owner = as(a.leagueId, a.ownerAccountId);
    expect(await setCurrentSeason(owner, { seasonId: otherSeason }, deps)).toMatchObject({
      error: { code: 'season-not-found' },
    });
    expect(
      await createSeason(owner, { slug: 'x-y', name: 'X', programId: otherProgram }, deps),
    ).toMatchObject({ error: { code: 'program-not-found' } });
    expect(
      await countOf('select count(*)::int as n from seasons where league_id = $1', [
        other.leagueId,
      ]),
    ).toBe(1);
  });
});
