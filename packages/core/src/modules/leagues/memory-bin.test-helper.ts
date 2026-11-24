// The bin's storage on plain objects, for core's bin tests. The same commands run
// against the real database in packages/database (bin-commands.test.ts).
import {
  memoryDatabase,
  memoryTransaction,
  testDeps,
} from '../../command/testing/memory-transaction.ts';
import type { ActivityEntry, Grant, Role } from '../access/index.ts';
import { binCutoff, type BinCounts, type RestoreGameTx } from './bin.ts';
import { childrenInFullConfirmed } from './settings/declarations.ts';

export const leagueId = '01900000-0000-7000-8000-000000000001';
export const ownerId = '01900000-0000-7000-8000-0000000000a1';
export const seasonId = '01900000-0000-7000-8000-0000000000c1';
/** A season of program p2; every other season is of program p1. */
export const otherSeasonId = '01900000-0000-7000-8000-0000000000c2';
export const teamId = (n: number) =>
  `01900000-0000-7000-8000-0000000e${String(n).padStart(4, '0')}`;

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
  /** Its season, for things of a season (the bin lists null otherwise). */
  season?: string;
  /** What restoring it meets: another thing holds its name. */
  clash?:
    | 'short-name-taken'
    | 'name-taken'
    | 'lineage-taken'
    | 'profile-taken'
    | 'game-number-taken';
  /** A game's other games at its time now (the clash check, A-19). */
  clashesWith?: string[];
  /** A person recorded as a child (R-28), for the first-child put-back (S-109). */
  child?: boolean;
};

export type MemoryBin = {
  status: 'live' | 'archived';
  things: Thing[];
  /** Roster entries by team id, to show they stay with the team. */
  rosters: Record<string, string[]>;
  grants: Grant[];
  activity: ActivityEntry[];
  /** The season's schedule revisions, numbered (A-19: a restored game writes one). */
  revisions: { number: number; summary: unknown }[];
  /** People on each team's roster, as the A-7 count reads them. */
  people: Record<string, number>;
  /** Who plays, and the league's saved "children in full" (S-109; adults and none to start). */
  audience: 'youth' | 'mixed' | 'adult';
  childrenInFull: boolean;
};

/** A grant of `role` to `accountId`, in force: league-wide, or at one program's (`program`). */
export const grantOf = (accountId: string, role: Role, program?: string): Grant => ({
  id: `g-${accountId}`,
  accountId,
  role,
  scope: program === undefined ? { type: 'league' } : { type: 'program', id: program },
  grantedByAccountId: null,
  revokedAt: null,
});

export function memoryBin(state: Partial<MemoryBin> = {}) {
  const db = memoryDatabase<MemoryBin>({
    status: 'live',
    things: [],
    rosters: {},
    grants: [],
    activity: [],
    revisions: [],
    people: {},
    audience: 'adult',
    childrenInFull: false,
    ...state,
  });
  const transaction = memoryTransaction(db, (s, jobs): RestoreGameTx => {
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
      scheduling: {
        latestRevision: async () => s.revisions.at(-1)?.number ?? null,
        insertRevision: async (_season, revision) => {
          if (s.revisions.some((r) => r.number === revision.number)) return false;
          s.revisions.push({ number: revision.number, summary: revision.summary });
          return true;
        },
        countPeopleOnTeams: async (_season, teams) =>
          teams.reduce((sum, team) => sum + (s.people[team] ?? 0), 0),
      },
      games: {
        find: async (id) =>
          find(id)?.kind === 'game' ? { homeTeamId: 'home', awayTeamId: 'away' } : undefined,
        clashesOf: async (id) => (find(id)?.clashesWith ?? []).map((other) => ({ id: other })),
      },
      bin: {
        firstChild: {
          leagueAudience: async () => s.audience,
          hasRecordedChild: async () =>
            s.things.some((t) => t.kind === 'person' && t.binnedAt === null && t.child === true),
          leagueSettingRows: async (key) =>
            key === childrenInFullConfirmed.key && s.childrenInFull
              ? [{ level: 'league', document: { version: 1, value: true }, version: 1 }]
              : [],
          clearLeagueSetting: async (key, version) => {
            if (key !== childrenInFullConfirmed.key || !s.childrenInFull || version !== 1) {
              return false;
            }
            s.childrenInFull = false;
            return true;
          },
        },
        list: async () =>
          s.things
            .filter((t) => t.binnedAt !== null)
            .map((t) => ({
              kind: t.kind,
              id: t.id,
              name: t.name,
              secondName: null,
              seasonId: t.season ?? null,
              binnedAt: t.binnedAt ?? '',
              kept: t.referenced === true,
            })),
        seasonProgramId: async (id) => (id === otherSeasonId ? 'p2' : 'p1'),
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
                seasonId: t.season ?? seasonId,
                binned: t.binnedAt !== null,
                status: t.status ?? 'scheduled',
                partInBin: t.partInBin === true,
              };
        },
        restoreTeam: async (id) =>
          restore(id, ['short-name-taken', 'name-taken', 'lineage-taken'] as const),
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
