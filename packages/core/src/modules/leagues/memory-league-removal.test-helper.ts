// Removing a league made by mistake, on plain objects, for core's command tests
// (step 2.150). The database's own checks (remove_draft_league, 0017) are stood in
// for by `found`: what the league holds beyond what the maker writes. The real
// checks, under the lock, are tested in packages/database.
import type { CommandContext, CommandDeps } from '../../command/index.ts';
import type { LeagueRemovalFinding, LeagueRemovalTx } from './ports.ts';

export type MemoryRemovalLeague = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly ownerAccountId: string;
  /** Why it is not exactly what the maker writes; empty when it may go. */
  readonly found: readonly LeagueRemovalFinding[];
};

export type MemoryRemoval = {
  leagues: MemoryRemovalLeague[];
  staff: string[];
  /** The platform log, as the database writes it in the same transaction. */
  platformLog: { id: string; leagueId: string; slug: string; actorAccountId: string }[];
  jobs: unknown[];
};

export const removalLeagueId = '01900000-0000-7000-8000-0000000000c1';
export const removalOwnerId = '01900000-0000-7000-8000-0000000000c2';
export const removalStaffId = '01900000-0000-7000-8000-0000000000c3';

/** One draft league, as the maker leaves it, and one member of our staff. */
export function memoryRemoval(change: Partial<MemoryRemovalLeague> = {}) {
  const state: MemoryRemoval = {
    leagues: [
      {
        id: removalLeagueId,
        slug: 'made-up-hoops',
        name: 'Made-up Hoops',
        ownerAccountId: removalOwnerId,
        found: [],
        ...change,
      },
    ],
    staff: [removalStaffId],
    platformLog: [],
    jobs: [],
  };
  const deps: CommandDeps<LeagueRemovalTx> = {
    // One transaction: work on a copy, kept only if the work returns.
    transaction: async (context, work) => {
      const draft: MemoryRemoval = structuredClone(state);
      const tx: LeagueRemovalTx = {
        jobs: {
          enqueue: async (job) => {
            draft.jobs.push(job);
          },
        },
        leagues: {
          isPlatformStaff: async () =>
            context.accountId !== null && draft.staff.includes(context.accountId),
        },
        leagueRemoval: {
          removeDraftLeague: async (typedSlug) => {
            const league = draft.leagues.find((l) => l.id === context.leagueId);
            if (league === undefined) return { removed: false, why: 'not-found' };
            if (league.slug !== typedSlug) return { removed: false, why: 'short-name-differs' };
            if (league.found.length > 0)
              return { removed: false, why: 'in-use', found: league.found };
            const entry = {
              id: `entry-${draft.platformLog.length + 1}`,
              leagueId: league.id,
              slug: league.slug,
              actorAccountId: context.accountId ?? '',
            };
            draft.platformLog.push(entry);
            draft.leagues = draft.leagues.filter((l) => l.id !== league.id);
            return {
              removed: true,
              slug: league.slug,
              name: league.name,
              ownerAccountId: league.ownerAccountId,
              logEntryId: entry.id,
            };
          },
        },
      };
      const result = await work(tx);
      Object.assign(state, draft);
      return result;
    },
    events: [],
    log: () => {},
    now: () => 0,
  };
  const as = (accountId: string | null, leagueId = removalLeagueId): CommandContext => ({
    leagueId,
    accountId,
    requestId: 'test',
  });
  return { state, deps, as };
}
