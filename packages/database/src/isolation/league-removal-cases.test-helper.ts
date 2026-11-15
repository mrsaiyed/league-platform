// The two-league harness's case for removing a league made by mistake (step 2.150,
// record 063). This is one of the very few things that deletes across a whole
// league, so the case is the worst one the harness can try: in each run's scope it
// makes a fresh draft league (as createLeague's own case does, owned by the run's
// account), then removes it through the real store and remove_draft_league (0017).
// Whatever the run, the leagues the harness forbids (B; A and B with no league set)
// must come out unchanged, and the answer must not depend on their rows.
//
// The removal runs as the tool runs it: as the tables' owner (the migration login),
// in the same transaction set to the same league and account. So the case steps out
// of app_user for the call, as the harness itself does to read, and steps back in.
import { createLeague, removeDraftLeague, type LeagueRemovalTx } from '@srleagues/core';
import { CompiledQuery, sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { leagueRemovalStore } from '../league-making/league-removal-store.ts';
import type { SqlSession } from '../migrations/index.ts';
import { harnessTx, inFreshLeague, runAsApp, runInScope } from './command-cases.test-helper.ts';
import { registerIsolationCase } from './isolation-registry.test-helper.ts';

/** The run's own transaction as the SqlSession the removal's store takes. */
function sessionOf(scope: LeagueScope): SqlSession {
  const trx = transactionOf(scope);
  return {
    query: async <Row>(text: string, params: readonly unknown[] = []) => {
      const result = await trx.executeQuery<Row>(CompiledQuery.raw(text, [...params]));
      return { rows: [...result.rows] };
    },
    exec: async (text: string) => {
      await sql.raw(text).execute(trx);
    },
  };
}

const slug = 'harness-removed-league';

registerIsolationCase({
  subject: removeDraftLeague,
  name: 'remove a draft league just made in a fresh league id by the run account, as our staff',
  run: (scope) =>
    inFreshLeague(scope, async (fresh) => {
      await runAsApp(createLeague, harnessTx, fresh, {
        slug,
        name: 'Harness removed league',
        timeZone: 'America/Chicago',
        audience: 'adult',
        ownerAccountId: scope.accountId,
        sportKey: 'basketball',
        firstSeason: { slug: 'harness-first', name: 'Harness first season' },
      });
      const trx = transactionOf(fresh);
      const { rows } = await sql<{ role: string }>`select current_user as role`.execute(trx);
      const role = rows[0]?.role ?? 'app_user';
      // What the tool's plan shows of the league: its version and creation time.
      const { rows: shown } = await sql<{ version: number; created_at: string }>`
        select version, created_at::text as created_at from leagues
        where id = ${fresh.leagueId}`.execute(trx);
      await sql`reset role`.execute(trx);
      try {
        return await runInScope(
          removeDraftLeague,
          (_scope, jobs): LeagueRemovalTx => ({
            jobs,
            leagues: {
              isPlatformStaff: async () => fresh.accountId !== null,
            },
            leagueRemoval: leagueRemovalStore(sessionOf(fresh)),
          }),
          fresh,
          {
            typedSlug: slug,
            shownVersion: shown[0]?.version ?? 0,
            shownCreatedAt: shown[0]?.created_at ?? '',
            typedOwnerEmail: null,
          },
        );
      } finally {
        await sql`set local role ${sql.id(role)}`.execute(trx);
      }
    }),
});
