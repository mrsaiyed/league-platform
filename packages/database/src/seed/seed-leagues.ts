// Loads the made-up seed leagues (T-195, seed-data.ts) into a PGlite database that has
// every migration applied. Made-up data only (T-201): this takes a PGlite, never an
// address, so it cannot reach a real database.
//
// Everything about a league goes through the same commands the product uses (create
// league, season, divisions, teams, people), run as the people the data names: our own
// staff creates the league, its owner does the rest. Accounts are the one thing written
// directly, since an account comes from signing in, which has no command here.
//
// Loading is safe to repeat: a league whose short name is already there is left alone
// and reported as such.
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
export async function seedLeaguesInto(pglite: PGlite): Promise<SeededLeague[]> {
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
    for (const league of seedLeagues) {
      loaded.push(await loadLeague(pglite, db, deps, staffId, league));
    }
    return loaded;
  } finally {
    await db.close();
  }
}
