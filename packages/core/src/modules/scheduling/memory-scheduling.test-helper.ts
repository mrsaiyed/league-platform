// The scheduling module's venue and court storage on plain objects, for core's command
// tests. The same commands run against the real database in packages/database (stores and
// the two-league harness); its name rules are stood in for here.
import {
  memoryDatabase,
  memoryTransaction,
  testDeps,
} from '../../command/testing/memory-transaction.ts';
import type { ActivityEntry, Grant } from '../access/index.ts';
import type { CourtRecord, SchedulingTx, VenueRecord } from './ports.ts';

export type MemoryScheduling = {
  status: string;
  venues: VenueRecord[];
  courts: CourtRecord[];
  grants: Grant[];
  activity: ActivityEntry[];
};

export const leagueId = '01900000-0000-7000-8000-000000000001';
export const ownerId = '01900000-0000-7000-8000-0000000000a1';
export const schedulerId = '01900000-0000-7000-8000-0000000000a2';
export const venueUuid = (n: number) =>
  `01900000-0000-7000-8000-0000000e${String(n).padStart(4, '0')}`;
export const courtUuid = (n: number) =>
  `01900000-0000-7000-8000-0000000f${String(n).padStart(4, '0')}`;

export function venue(n: number, fields: Partial<VenueRecord> = {}): VenueRecord {
  return {
    id: venueUuid(n),
    name: `Venue ${n}`,
    address: null,
    mapLink: null,
    binned: false,
    version: 1,
    ...fields,
  };
}

export function court(n: number, venueNumber: number, fields: Partial<CourtRecord> = {}) {
  return {
    id: courtUuid(n),
    venueId: venueUuid(venueNumber),
    name: `Court ${n}`,
    sort: n,
    binned: false,
    version: 1,
    ...fields,
  } satisfies CourtRecord;
}

/** A scheduler: the role that holds `venues.manage` without being an admin (P4 §4). */
export const schedulerGrant = {
  id: '01900000-0000-7000-8000-0000000000f1',
  accountId: schedulerId,
  role: 'scheduler',
  scope: { type: 'league' },
  grantedByAccountId: ownerId,
  revokedAt: null,
} as const;

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function memoryScheduling(state: Partial<MemoryScheduling> = {}) {
  const db = memoryDatabase<MemoryScheduling>({
    status: 'draft',
    venues: [],
    courts: [],
    grants: [],
    activity: [],
    ...state,
  });
  const transaction = memoryTransaction(db, (s, jobs): SchedulingTx => {
    const venueNameTaken = (name: string, except?: string) =>
      s.venues.some((v) => v.id !== except && !v.binned && sameName(v.name, name));
    const courtNameTaken = (venueId: string, name: string, except?: string) =>
      s.courts.some(
        (c) => c.id !== except && !c.binned && c.venueId === venueId && sameName(c.name, name),
      );
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
      scheduling: {
        findVenue: async (id) => s.venues.find((v) => v.id === id),
        listVenues: async () =>
          s.venues
            .filter((v) => !v.binned)
            .map((v) => ({
              ...v,
              courts: s.courts
                .filter((c) => c.venueId === v.id && !c.binned)
                .sort((a, b) => a.sort - b.sort),
            })),
        createVenue: async (v) => {
          if (venueNameTaken(v.name)) return 'name-taken';
          const id = venueUuid(s.venues.length + 1);
          s.venues.push({ id, ...v, binned: false, version: 1 });
          return id;
        },
        updateVenue: async (id, change, version) => {
          const at = s.venues.findIndex((v) => v.id === id);
          const found = s.venues[at];
          if (found === undefined || found.binned || found.version !== version) return undefined;
          if (change.name !== undefined && venueNameTaken(change.name, id)) return 'name-taken';
          s.venues[at] = { ...found, ...change, version: found.version + 1 };
          return found.version + 1;
        },
        setVenueBinned: async (id, binned) => {
          const at = s.venues.findIndex((v) => v.id === id);
          const found = s.venues[at];
          if (found === undefined) return false;
          if (!binned && venueNameTaken(found.name, id)) return 'name-taken';
          s.venues[at] = { ...found, binned, version: found.version + 1 };
          return true;
        },
        hasLiveCourts: async (id) => s.courts.some((c) => c.venueId === id && !c.binned),
        listCourts: async (id) =>
          s.courts.filter((c) => c.venueId === id && !c.binned).sort((a, b) => a.sort - b.sort),
        findCourt: async (id) => s.courts.find((c) => c.id === id),
        createCourt: async (c) => {
          if (courtNameTaken(c.venueId, c.name)) return 'name-taken';
          const id = courtUuid(s.courts.length + 1);
          s.courts.push({ id, ...c, binned: false, version: 1 });
          return id;
        },
        updateCourt: async (id, change, version) => {
          const at = s.courts.findIndex((c) => c.id === id);
          const found = s.courts[at];
          if (found === undefined || found.binned) return undefined;
          if (version !== undefined && found.version !== version) return undefined;
          if (change.name !== undefined && courtNameTaken(found.venueId, change.name, id)) {
            return 'name-taken';
          }
          s.courts[at] = { ...found, ...change, version: found.version + 1 };
          return found.version + 1;
        },
        setCourtBinned: async (id, binned) => {
          const at = s.courts.findIndex((c) => c.id === id);
          const found = s.courts[at];
          if (found === undefined) return false;
          if (!binned && courtNameTaken(found.venueId, found.name, id)) return 'name-taken';
          s.courts[at] = { ...found, binned, version: found.version + 1 };
          return true;
        },
      },
    };
  });
  const deps = testDeps(transaction);
  const as = (accountId: string | null) => ({ leagueId, accountId, requestId: 'request-1' });
  return { db, deps, as };
}
