// Development-only bootstrap (T-195): loads the made-up seed leagues (seed-data.ts) into
// a PGlite database that has every migration applied. Made-up data only (T-201): it
// takes a PGlite, never an address or a scope, so it cannot reach a real database, and
// it is not one of the product's commands.
//
// For each league it runs the product's own commands, each in its own scoped
// transaction for that league (create league, status, season, divisions, teams,
// people), acting as the people the data names: our own staff creates the league and
// its owner does the rest. Two things are written directly, not by a command: accounts
// (they come from signing in, which has no command here) and role grants (through the
// access store, as the owner; the invite and accept commands need email tokens).
//
// Loading is NOT one transaction, since each command has its own, so a load that stops
// part-way leaves a partly loaded league. A rerun checks each existing league against
// the data: a whole one is left alone ("Already there"); anything else stops with a
// plain message, never a false "Already there". Start again from a fresh database.
import type { PGlite } from '@electric-sql/pglite';
import {
  createDivision,
  createLeague,
  createPerson,
  createSeason,
  createTeam,
  leagueScope,
  setLeagueStatus,
  type AccessTx,
  type CommandContext,
  type CommandDeps,
  type LeaguesTx,
  type PeopleTx,
  type TeamsTx,
} from '@srleagues/core';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { LeagueScope } from '../db/transaction-scope.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withTransaction } from '../db/with-transaction.ts';
import {
  accessStore,
  activityLogStore,
  divisionsStore,
  jobsStore,
  leaguesStore,
  peopleStore,
  teamsStore,
} from '../stores/index.ts';
import { seedLeagues, seedStaff, type SeedLeague } from './seed-data.ts';

export type SeededLeague = {
  readonly slug: string;
  readonly leagueId: string;
  /** False when the league was already there and was left alone. */
  readonly created: boolean;
};

type SeedTx = LeaguesTx & PeopleTx & TeamsTx & AccessTx;

/** The deps of commands over any one module's transaction. */
type Deps = {
  readonly leagues: CommandDeps<LeaguesTx>;
  readonly people: CommandDeps<PeopleTx>;
  readonly teams: CommandDeps<TeamsTx>;
};

async function accountId(pglite: PGlite, email: string, displayName: string): Promise<string> {
  const found = await pglite.query<{ id: string }>(
    'select id from accounts where lower(email) = lower($1)',
    [email],
  );
  if (found.rows[0] !== undefined) return found.rows[0].id;
  const made = await pglite.query<{ id: string }>(
    'insert into accounts (email, display_name) values ($1, $2) returning id',
    [email, displayName],
  );
  return made.rows[0]!.id;
}

/** Whether a league row holds everything its data lists, as opposed to a partial load. */
async function holdsEverything(
  pglite: PGlite,
  leagueId: string,
  league: SeedLeague,
): Promise<boolean> {
  const count = async (table: string, extra = '') =>
    (
      await pglite.query<{ n: number }>(
        `select count(*)::int as n from ${table} where league_id = $1${extra}`,
        [leagueId],
      )
    ).rows[0]!.n;
  const teams = league.divisions.reduce((sum, d) => sum + d.teams.length, 0);
  return (
    (await count('seasons')) === 1 &&
    (await count('divisions')) === league.divisions.length &&
    (await count('teams')) === teams &&
    (await count('people')) === league.people.length &&
    (await count('role_grants', ' and revoked_at is null')) === league.members.length
  );
}

function must<T>(what: string, result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(`Seeding failed at ${what}: ${JSON.stringify(result.error)}`);
  return result.value;
}

async function loadLeague(
  pglite: PGlite,
  db: DatabaseHandle,
  deps: Deps,
  staffId: string,
  league: SeedLeague,
): Promise<SeededLeague> {
  const existing = await pglite.query<{ id: string }>('select id from leagues where slug = $1', [
    league.slug,
  ]);
  if (existing.rows[0] !== undefined) {
    if (!(await holdsEverything(pglite, existing.rows[0].id, league))) {
      throw new Error(
        `The seed league ${league.slug} is only partly loaded (an earlier load stopped part-way). Start again from a fresh database.`,
      );
    }
    return { slug: league.slug, leagueId: existing.rows[0].id, created: false };
  }
  const ownerId = await accountId(pglite, league.owner.email, league.owner.displayName);
  const leagueId = (await pglite.query<{ id: string }>('select uuid_v7() as id')).rows[0]!.id;
  const as = (actor: string): CommandContext => ({
    leagueId,
    accountId: actor,
    requestId: `seed-${league.slug}`,
  });

  const created = must(
    'league',
    await createLeague(
      as(staffId),
      {
        slug: league.slug,
        name: league.name,
        timeZone: league.timeZone,
        audience: 'adult',
        ownerAccountId: ownerId,
        sportKey: 'basketball',
      },
      deps.leagues,
    ),
  );
  must(
    'league status',
    await setLeagueStatus(as(ownerId), { status: 'live', version: created.version }, deps.leagues),
  );
  const { seasonId } = must(
    'season',
    await createSeason(as(ownerId), { ...league.season }, deps.leagues),
  );
  for (const division of league.divisions) {
    const { divisionId } = must(
      'division',
      await createDivision(as(ownerId), { seasonId, name: division.name }, deps.leagues),
    );
    for (const team of division.teams) {
      must(
        'team',
        await createTeam(
          as(ownerId),
          { seasonId, divisionId, ...team, statsVisibility: 'everyone' },
          deps.teams,
        ),
      );
    }
  }
  for (const person of league.people) {
    must('person', await createPerson(as(ownerId), person, deps.people));
  }
  for (const member of league.members) {
    const memberId = await accountId(pglite, member.email, member.displayName);
    await withTransaction(db, { leagueId, accountId: ownerId }, (scope) =>
      accessStore(scope).createGrant({
        accountId: memberId,
        role: member.role,
        scope: leagueScope,
        grantedByAccountId: ownerId,
      }),
    );
  }
  return { slug: league.slug, leagueId, created: true };
}

/** Loads every seed league that is not there yet. */
export async function seedLeaguesInto(
  pglite: PGlite,
  leagues: readonly SeedLeague[] = seedLeagues,
): Promise<SeededLeague[]> {
  const db = createDatabase({ kind: 'pglite', pglite });
  try {
    const staffId = await accountId(pglite, seedStaff.email, seedStaff.displayName);
    const makeTx = (scope: LeagueScope): SeedTx => ({
      jobs: jobsStore(scope),
      leagues: leaguesStore(scope, { platformStaff: [staffId] }),
      divisions: divisionsStore(scope),
      access: accessStore(scope),
      activity: activityLogStore(scope),
      people: peopleStore(scope),
      teams: teamsStore(scope),
    });
    const one = {
      transaction: commandTransaction(db, makeTx),
      events: [],
      log: () => {},
      now: () => Date.now(),
    };
    const deps: Deps = { leagues: one, people: one, teams: one };
    const loaded: SeededLeague[] = [];
    for (const league of leagues) {
      loaded.push(await loadLeague(pglite, db, deps, staffId, league));
    }
    return loaded;
  } finally {
    await db.close();
  }
}
