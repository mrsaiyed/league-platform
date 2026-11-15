// The store of core's removeDraftLeague (step 2.150, record 063), bound to one
// transaction of the migration login that `removalTransaction` set to one league and
// one staff account. It passes the database nothing but the typed short name: the
// league and the account are the transaction's own (current_league_id() and
// current_account_id()), and remove_draft_league (0017) refuses any other.
import type { DraftLeagueRemoval, LeagueRemovalStore } from '@srleagues/core';
import type { SqlSession } from '../migrations/index.ts';
import { findingOf, platformLogEntry } from './removal-queries.ts';

type RemovalRow = { outcome: string; problems: string[]; entry_id: string | null };

export function leagueRemovalStore(session: SqlSession): LeagueRemovalStore {
  return {
    removeDraftLeague: async (typedSlug): Promise<DraftLeagueRemoval> => {
      const { rows } = await session.query<RemovalRow>(
        `select outcome, problems, entry_id::text as entry_id
         from public.remove_draft_league(public.current_league_id(), $1, public.current_account_id())`,
        [typedSlug],
      );
      const row = rows[0];
      if (row === undefined) throw new Error('remove_draft_league said nothing.');
      if (row.outcome === 'not-found' || row.outcome === 'short-name-differs') {
        return { removed: false, why: row.outcome };
      }
      if (row.outcome === 'in-use') {
        return { removed: false, why: 'in-use', found: row.problems.map(findingOf) };
      }
      if (row.outcome !== 'removed' || row.entry_id === null) {
        throw new Error('remove_draft_league gave an outcome this code does not know.');
      }
      // Read back in the same transaction from the entry itself: what was removed.
      const entry = await platformLogEntry(session, row.entry_id);
      const { rows: details } = await session.query<{ owner: string | null }>(
        "select details ->> 'ownerAccountId' as owner from platform.activity_log where id = $1",
        [row.entry_id],
      );
      const owner = details[0]?.owner;
      if (entry === undefined || owner === null || owner === undefined) {
        throw new Error('The platform log entry of the removal could not be read.');
      }
      return {
        removed: true,
        slug: entry.slug,
        name: entry.name,
        ownerAccountId: owner,
        logEntryId: row.entry_id,
      };
    },
  };
}
