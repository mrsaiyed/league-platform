// A fresh database with every migration in supabase/migrations applied, and small
// helpers that make the made-up rows the schema tests need.
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { expect } from 'vitest';
import { applyMigrations, pgliteDriver } from '../migrations/index.ts';

export type Sql = PGlite | Transaction;

/** Opens an in-memory database and applies every migration. Throws if one fails. */
export async function freshSchema(): Promise<PGlite> {
  const db = new PGlite();
  const run = await applyMigrations(pgliteDriver(db));
  if (!run.ok) throw new Error(`migrations failed: ${run.error.code}: ${run.error.message}`);
  return db;
}

/** The first row of a query; throws when there is none. */
export async function one<Row>(db: Sql, sql: string, params: unknown[] = []): Promise<Row> {
  const { rows } = await db.query<Row>(sql, params);
  const row = rows[0];
  if (row === undefined) throw new Error(`no row from: ${sql}`);
  return row;
}

let counter = 0;
/** A name nobody else in this test run has, such as `north-7`. */
export const unique = (prefix: string) => `${prefix}-${++counter}`;

/** Makes an account and returns its id. */
export async function newAccount(db: Sql, email = `${unique('person')}@example.test`) {
  const row = await one<{ id: string }>(
    db,
    'insert into accounts (email, display_name) values ($1, $2) returning id',
    [email, 'Made-up Person'],
  );
  return row.id;
}

export type MadeLeague = { leagueId: string; ownerId: string; defaultProgramId: string };

/** Makes a league and its default program in one transaction, as the leagues command will. */
export async function newLeague(db: PGlite, slug = unique('league')): Promise<MadeLeague> {
  const ownerId = await newAccount(db);
  return db.transaction(async (tx) => {
    const league = await one<{ id: string }>(
      tx,
      `insert into leagues (slug, name, time_zone, audience, listed, owner_account_id)
       values ($1, 'Made-up League', 'America/Chicago', 'adult', true, $2) returning id`,
      [slug, ownerId],
    );
    const program = await one<{ id: string }>(
      tx,
      `insert into programs (league_id, slug, name, sport_key, is_default)
       values ($1, 'main', 'Main', 'basketball', true) returning id`,
      [league.id],
    );
    return { leagueId: league.id, ownerId, defaultProgramId: program.id };
  });
}

/** Adds a non-default program to a league and returns its id. */
export async function newProgram(db: Sql, leagueId: string, slug = unique('program')) {
  const row = await one<{ id: string }>(
    db,
    `insert into programs (league_id, slug, name, sport_key)
     values ($1, $2, 'Made-up Program', 'volleyball') returning id`,
    [leagueId, slug],
  );
  return row.id;
}

/** Adds a season to a program and returns its id. */
export async function newSeason(
  db: Sql,
  leagueId: string,
  programId: string,
  options: { slug?: string; isCurrent?: boolean } = {},
) {
  const row = await one<{ id: string }>(
    db,
    `insert into seasons (league_id, program_id, slug, name, is_current)
     values ($1, $2, $3, 'Made-up Season', $4) returning id`,
    [leagueId, programId, options.slug ?? unique('season'), options.isCurrent ?? false],
  );
  return row.id;
}

/** Adds a division to a season (under `parentId` if given) and returns its id. */
export async function newDivision(
  db: Sql,
  leagueId: string,
  seasonId: string,
  options: { name?: string; parentId?: string } = {},
) {
  const row = await one<{ id: string }>(
    db,
    `insert into divisions (league_id, season_id, parent_division_id, name)
     values ($1, $2, $3, $4) returning id`,
    [leagueId, seasonId, options.parentId ?? null, options.name ?? unique('Division')],
  );
  return row.id;
}

/** Adds a venue to a league and returns its id. */
export async function newVenue(db: Sql, leagueId: string, name = unique('Venue')) {
  const row = await one<{ id: string }>(
    db,
    'insert into venues (league_id, name) values ($1, $2) returning id',
    [leagueId, name],
  );
  return row.id;
}

/** Adds a court to a venue and returns its id. */
export async function newCourt(db: Sql, leagueId: string, venueId: string, name = unique('Court')) {
  const row = await one<{ id: string }>(
    db,
    'insert into courts (league_id, venue_id, name) values ($1, $2, $3) returning id',
    [leagueId, venueId, name],
  );
  return row.id;
}

/** Adds a person to a league and returns their id. */
export async function newPerson(
  db: Sql,
  leagueId: string,
  options: { firstName?: string; lastName?: string; profileId?: string } = {},
) {
  const row = await one<{ id: string }>(
    db,
    `insert into people (league_id, first_name, last_name, profile_id)
     values ($1, $2, $3, $4) returning id`,
    [
      leagueId,
      options.firstName ?? 'Made-up',
      options.lastName ?? unique('Player'),
      options.profileId ?? null,
    ],
  );
  return row.id;
}

/** Adds a team to a season (in `divisionId` if given) and returns its id. */
export async function newTeam(
  db: Sql,
  leagueId: string,
  seasonId: string,
  options: { slug?: string; name?: string; divisionId?: string; lineageId?: string } = {},
) {
  const row = await one<{ id: string }>(
    db,
    `insert into teams (league_id, season_id, division_id, slug, name, stats_visibility, lineage_id)
     values ($1, $2, $3, $4, $5, 'everyone', coalesce($6::uuid, public.uuid_v7())) returning id`,
    [
      leagueId,
      seasonId,
      options.divisionId ?? null,
      options.slug ?? unique('team'),
      options.name ?? unique('Team'),
      options.lineageId ?? null,
    ],
  );
  return row.id;
}

/** Puts a person on a team and returns the roster entry's id. */
export async function newRosterEntry(
  db: Sql,
  leagueId: string,
  teamId: string,
  personId: string,
  options: { jersey?: string | null; role?: string } = {},
) {
  const row = await one<{ id: string }>(
    db,
    `insert into roster_entries (league_id, team_id, person_id, jersey_number, role)
     values ($1, $2, $3, $4, $5) returning id`,
    [leagueId, teamId, personId, options.jersey ?? null, options.role ?? 'player'],
  );
  return row.id;
}

/** Which league and account a transaction is for (T-61). Missing means not set. */
export type AppContext = { league?: string; account?: string };

/**
 * Runs `work` in one transaction as the app's restricted role (app_user, T-60),
 * with the league and account set for that transaction only, as the app does.
 */
export function asApp<T>(
  db: PGlite,
  context: AppContext,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query('set local role app_user');
    if (context.league !== undefined) {
      await tx.query("select set_config('app.league_id', $1, true)", [context.league]);
    }
    if (context.account !== undefined) {
      await tx.query("select set_config('app.account_id', $1, true)", [context.account]);
    }
    return work(tx);
  });
}

/** PostgreSQL error codes the tests expect. */
export const refused = {
  unique: { code: '23505' },
  check: { code: '23514' },
  foreignKey: { code: '23503' },
  notNull: { code: '23502' },
  restrict: { code: '23001' },
  /** The role lacks the privilege, or must own the object. */
  privilege: { code: '42501' },
  /** A written row fails a row-level security policy (WITH CHECK). */
  policy: { code: '42501', message: expect.stringContaining('row-level security') },
} as const;
