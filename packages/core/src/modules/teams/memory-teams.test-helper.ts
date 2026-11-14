// The teams module's storage on plain objects, for core's command tests. The same
// commands run against the real database in packages/database (stores and the
// two-league harness); its unique-name rules are stood in for here.
import {
  memoryDatabase,
  memoryTransaction,
  testDeps,
} from '../../command/testing/memory-transaction.ts';
import type { ActivityEntry, Grant } from '../access/index.ts';
import type { StoredSetting } from '../leagues/index.ts';
import type { RosterEntryRecord, TeamRecord, TeamsTx } from './ports.ts';

export type MemoryTeams = {
  status: string;
  /** Seasons and the program each belongs to. */
  seasons: { id: string; programId: string }[];
  divisions: { id: string; seasonId: string; binned: boolean }[];
  teams: TeamRecord[];
  /** People of the league (not merged away), in or out of the bin. */
  people: { id: string; firstName: string; lastName: string; binned: boolean }[];
  roster: RosterEntryRecord[];
  /** The season asks for unique jersey numbers in a team (0008). */
  uniqueJerseys: boolean;
  grants: Grant[];
  /** The league's stored setting rows by key, as setting_values keeps them. */
  settings: Record<string, StoredSetting[]>;
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
export const personUuid = (n: number) =>
  `01900000-0000-7000-8000-0000000b${String(n).padStart(4, '0')}`;
export const entryUuid = (n: number) =>
  `01900000-0000-7000-8000-0000000e${String(n).padStart(4, '0')}`;
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

export function person(n: number, binned = false) {
  return { id: personUuid(n), firstName: `First${n}`, lastName: `Last${n}`, binned };
}

export function entry(n: number, fields: Partial<RosterEntryRecord> = {}): RosterEntryRecord {
  return {
    id: entryUuid(n),
    teamId: teamUuid(1),
    personId: personUuid(n),
    jerseyNumber: null,
    role: 'player',
    joinedOn: null,
    leftOn: null,
    sort: n - 1,
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
    people: [],
    roster: [],
    uniqueJerseys: false,
    grants: [],
    settings: {},
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
        leagueSettingRows: async (key) => s.settings[key] ?? [],
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
        findPerson: async (id) => s.people.find((p) => p.id === id),
        findRosterEntry: async (id) => s.roster.find((e) => e.id === id),
        listRoster: async (teamId) =>
          s.roster
            .filter((e) => e.teamId === teamId)
            // As queries/list-roster.ts: current first, then those who left by date, then place, then id.
            .sort(
              (a, b) =>
                Number(a.leftOn !== null) - Number(b.leftOn !== null) ||
                (a.leftOn ?? '').localeCompare(b.leftOn ?? '') ||
                a.sort - b.sort ||
                a.id.localeCompare(b.id),
            )
            .map((e) => {
              const p = s.people.find((x) => x.id === e.personId);
              return {
                ...e,
                firstName: p?.firstName ?? '',
                lastName: p?.lastName ?? '',
                publicName: null,
              };
            }),
        addRosterEntry: async (e) => {
          const mine = s.roster.filter((r) => r.teamId === e.teamId);
          if (mine.some((r) => r.personId === e.personId && r.leftOn === null)) {
            return 'already-on-team';
          }
          if (
            s.uniqueJerseys &&
            e.jerseyNumber !== null &&
            mine.some((r) => r.leftOn === null && r.jerseyNumber === e.jerseyNumber)
          ) {
            return 'jersey-taken';
          }
          const id = entryUuid(s.roster.length + 1);
          s.roster.push({
            id,
            ...e,
            leftOn: null,
            sort: Math.max(-1, ...mine.map((r) => r.sort)) + 1,
            version: 1,
          });
          return id;
        },
        updateRosterEntry: async (id, change, version) => {
          const at = s.roster.findIndex((e) => e.id === id);
          const found = s.roster[at];
          if (found === undefined || (version !== undefined && found.version !== version)) {
            return undefined;
          }
          const next = { ...found, ...change, version: found.version + 1 };
          if (
            s.uniqueJerseys &&
            change.jerseyNumber !== undefined &&
            change.jerseyNumber !== null &&
            s.roster.some(
              (r) =>
                r.id !== id &&
                r.teamId === found.teamId &&
                r.leftOn === null &&
                r.jerseyNumber === change.jerseyNumber,
            )
          ) {
            return 'jersey-taken';
          }
          s.roster[at] = next;
          return next.version;
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
