// The teams module's storage on plain objects, for core's command tests. The same
// commands run against the real database in packages/database (stores and the
// two-league harness); its unique-name rules are stood in for here.
import {
  memoryDatabase,
  memoryTransaction,
  testDeps,
} from '../../command/testing/memory-transaction.ts';
import type { ActivityEntry, Grant } from '../access/index.ts';
import type { TeamRecord, TeamsTx } from './ports.ts';

export type MemoryTeams = {
  status: string;
  /** Seasons and the program each belongs to. */
  seasons: { id: string; programId: string }[];
  divisions: { id: string; seasonId: string; binned: boolean }[];
  teams: TeamRecord[];
  grants: Grant[];
  activity: ActivityEntry[];
};

export const leagueId = '01900000-0000-7000-8000-000000000001';
export const ownerId = '01900000-0000-7000-8000-0000000000a1';
export const schedulerId = '01900000-0000-7000-8000-0000000000a2';
export const programAdminId = '01900000-0000-7000-8000-0000000000e1';
export const seasonId = '01900000-0000-7000-8000-0000000000c1';
export const otherSeasonId = '01900000-0000-7000-8000-0000000000c2';
export const divisionId = '01900000-0000-7000-8000-0000000d0001';
export const otherSeasonDivisionId = '01900000-0000-7000-8000-0000000d0002';
export const teamUuid = (n: number) =>
  `01900000-0000-7000-8000-0000000a${String(n).padStart(4, '0')}`;

export const seasons = [
  { id: seasonId, programId: 'p1' },
  { id: otherSeasonId, programId: 'p2' },
];
export const divisions = [
  { id: divisionId, seasonId, binned: false },
  { id: otherSeasonDivisionId, seasonId: otherSeasonId, binned: false },
];

export function team(n: number, fields: Partial<TeamRecord> = {}): TeamRecord {
  return {
    id: teamUuid(n),
    seasonId,
    divisionId: null,
    slug: `team-${n}`,
    name: `Team ${n}`,
    color: null,
    statsVisibility: 'everyone',
    lineageId: `lineage-${n}`,
    binned: false,
    version: 1,
    ...fields,
  };
}

/** A scheduler: holds no teams permission (P4 §4). */
export const schedulerGrant = {
  id: '01900000-0000-7000-8000-0000000000f2',
  accountId: schedulerId,
  role: 'scheduler',
  scope: { type: 'league' },
  grantedByAccountId: ownerId,
  revokedAt: null,
} as const;

/** An admin limited to program p1 (P4 §4). */
export const programAdminGrant = {
  id: '01900000-0000-7000-8000-0000000000f1',
  accountId: programAdminId,
  role: 'admin',
  scope: { type: 'program', id: 'p1' },
  grantedByAccountId: ownerId,
  revokedAt: null,
} as const;

export function memoryTeams(state: Partial<MemoryTeams> = {}) {
  const db = memoryDatabase<MemoryTeams>({
    status: 'draft',
    seasons,
    divisions,
    teams: [],
    grants: [],
    activity: [],
    ...state,
  });
  const transaction = memoryTransaction(db, (s, jobs): TeamsTx => {
    const clash = (t: { seasonId: string; slug: string; name: string }, except?: string) => {
      const others = s.teams.filter(
        (o) => o.id !== except && !o.binned && o.seasonId === t.seasonId,
      );
      if (others.some((o) => o.slug === t.slug)) return 'slug-taken' as const;
      if (others.some((o) => o.name.trim().toLowerCase() === t.name.trim().toLowerCase())) {
        return 'name-taken' as const;
      }
      return undefined;
    };
    return {
      jobs,
      access: {
        ownerAccountId: async () => ownerId,
        leagueStatus: async () => s.status,
        activeGrantsOf: async (account) =>
          s.grants.filter((g) => g.accountId === account && g.revokedAt === null),
      },
      activity: {
        record: async (entry) => void s.activity.push(entry),
        list: async () => [],
      },
      teams: {
        find: async (id) => s.teams.find((t) => t.id === id),
        create: async (t) => {
          const taken = clash({ seasonId: t.seasonId, slug: t.slug, name: t.name });
          if (taken !== undefined) return taken;
          const id = teamUuid(s.teams.length + 1);
          s.teams.push({
            id,
            ...t,
            lineageId: `lineage-${s.teams.length + 1}`,
            binned: false,
            version: 1,
          });
          return id;
        },
        update: async (id, change, version) => {
          const at = s.teams.findIndex((t) => t.id === id);
          const found = s.teams[at];
          if (found === undefined || found.binned || found.version !== version) return undefined;
          const next = { ...found, ...change, version: found.version + 1 };
          const taken = clash(next, id);
          if (taken !== undefined) return taken;
          s.teams[at] = next;
          return next.version;
        },
        setBinned: async (id, binned) => {
          const at = s.teams.findIndex((t) => t.id === id);
          const found = s.teams[at];
          if (found === undefined) return false;
          s.teams[at] = { ...found, binned, version: found.version + 1 };
          return true;
        },
        seasonProgramId: async (id) => s.seasons.find((x) => x.id === id)?.programId,
        findDivision: async (id) => s.divisions.find((d) => d.id === id),
      },
    };
  });
  const deps = testDeps(transaction);
  const as = (accountId: string | null) => ({ leagueId, accountId, requestId: 'request-1' });
  return { db, deps, as };
}
