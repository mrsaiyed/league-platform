// The bin's storage on plain objects, for core's bin tests. The same commands run
// against the real database in packages/database (bin-commands.test.ts).
import {
  memoryDatabase,
  memoryTransaction,
  testDeps,
} from '../../command/testing/memory-transaction.ts';
import type { ActivityEntry, Grant } from '../access/index.ts';
import { binCutoff, type BinCounts, type BinTx } from './bin.ts';

export const leagueId = '01900000-0000-7000-8000-000000000001';
export const ownerId = '01900000-0000-7000-8000-0000000000a1';
export const seasonId = '01900000-0000-7000-8000-0000000000c1';
export const teamId = (n: number) => `01900000-0000-7000-8000-0000000e${String(n).padStart(4, '0')}`;

type Thing = {
  id: string;
  kind: 'team' | 'division' | 'venue' | 'court' | 'person' | 'game';
  name: string;
  /** Null: not in the bin. */
  binnedAt: string | null;
  /** Something still points at it, so a purge leaves it. */
  referenced?: boolean;
  divisionInBin?: boolean;
  status?: string;
  partInBin?: boolean;
  /** What restoring it meets: another thing holds its name. */
  clash?: 'short-name-taken' | 'name-taken' | 'profile-taken' | 'game-number-taken';
};

export type MemoryBin = {
  status: 'live' | 'archived';
  things: Thing[];
  /** Roster entries by team id, to show they stay with the team. */
  rosters: Record<string, string[]>;
  grants: Grant[];
  activity: ActivityEntry[];
};

export function memoryBin(state: Partial<MemoryBin> = {}) {
  const db = memoryDatabase<MemoryBin>({
    status: 'live',
    things: [],
    rosters: {},
    grants: [],
    activity: [],
    ...state,
  });
  const transaction = memoryTransaction(db, (s, jobs): BinTx => {
    const find = (id: string) => s.things.find((t) => t.id === id);
    const restore = <T extends string>(id: string, clashes: readonly T[]): boolean | T => {
      const t = find(id);
      if (t === undefined) return false;
      if (t.clash !== undefined && (clashes as readonly string[]).includes(t.clash)) {
        return t.clash as T;
      }
      t.binnedAt = null;
      return true;
    };
    return {
      jobs,
      access: {
        ownerAccountId: async () => ownerId,
        leagueStatus: async () => s.status,
        activeGrantsOf: async (account) =>
          s.grants.filter((g) => g.accountId === account && g.revokedAt === null),
      },
      activity: { record: async (entry) => void s.activity.push(entry), list: async () => [] },
      bin: {
        list: async () =>
          s.things
            .filter((t) => t.binnedAt !== null)
            .map((t) => ({
              kind: t.kind,
              id: t.id,
              name: t.name,
              secondName: null,
              seasonId: null,
              binnedAt: t.binnedAt ?? '',
            })),
        seasonProgramId: async () => 'p1',
        findTeam: async (id) => {
          const t = find(id);
          return t === undefined
            ? undefined
            : { seasonId, binned: t.binnedAt !== null, divisionInBin: t.divisionInBin === true };
        },
        findPerson: async (id) => {
          const t = find(id);
          return t === undefined ? undefined : { binned: t.binnedAt !== null };
        },
        findGame: async (id) => {
          const t = find(id);
          return t === undefined
            ? undefined
            : {
                seasonId,
                binned: t.binnedAt !== null,
                status: t.status ?? 'scheduled',
                partInBin: t.partInBin === true,
              };
        },
        restoreTeam: async (id) => restore(id, ['short-name-taken', 'name-taken'] as const),
        restorePerson: async (id) => restore(id, ['profile-taken'] as const),
        restoreGame: async (id) => restore(id, ['game-number-taken'] as const),
        purge: async (cutoff) => {
          const counts = { courts: 0, venues: 0, teams: 0, divisions: 0, people: 0 };
          const key = {
            court: 'courts',
            venue: 'venues',
            team: 'teams',
            division: 'divisions',
            person: 'people',
          } as const;
          s.things = s.things.filter((t) => {
            const old = t.binnedAt !== null && Date.parse(t.binnedAt) <= cutoff.getTime();
            if (!old || t.referenced === true || t.kind === 'game') return true;
            counts[key[t.kind]]++;
            if (t.kind === 'team') delete s.rosters[t.id];
            return false;
          });
          return counts satisfies BinCounts;
        },
      },
    };
  });
  const deps = testDeps(transaction);
  const as = (accountId: string | null) => ({ leagueId, accountId, requestId: 'r-1' });
  return { db, deps, as, cutoffOf: binCutoff };
}
