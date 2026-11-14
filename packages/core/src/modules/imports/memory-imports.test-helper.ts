// The imports module's storage on plain objects, for core's command tests. The same commands
// run against the real database in packages/database (stores and the two-league harness).
import {
  memoryDatabase,
  memoryTransaction,
  testDeps,
} from '../../command/testing/memory-transaction.ts';
import type { DomainEvent, EventHandler } from '../../command/index.ts';
import type { ActivityEntry, Grant } from '../access/index.ts';
import type { GameRecord } from '../games/index.ts';
import type { DraftRecord } from '../scheduling/index.ts';
import type { ScheduleState } from '../scheduling/index.ts';
import type { ImportRecord, ImportScoresTx } from './ports.ts';
import type { SeasonNames } from './read-fixtures.ts';

export type MemoryImports = {
  status: string;
  grants: Grant[];
  activity: ActivityEntry[];
  seasons: { id: string; programId: string }[];
  names: SeasonNames;
  /** Venues not in the bin that were binned after the preview, by id. */
  binnedVenueIds: string[];
  imports: ImportRecord[];
  latestRevision: number | null;
  draft: DraftRecord | undefined;
  draftsStarted: number;
  schedule: ScheduleState;
  games: GameRecord[];
};

export const leagueId = '01900000-0000-7000-8000-000000000001';
export const ownerId = '01900000-0000-7000-8000-0000000000a1';
export const schedulerId = '01900000-0000-7000-8000-0000000000a2';
export const scorekeeperId = '01900000-0000-7000-8000-0000000000a3';
export const editorId = '01900000-0000-7000-8000-0000000000a4';
export const seasonId = '01900000-0000-7000-8000-0000000d0001';
export const otherSeasonId = '01900000-0000-7000-8000-0000000d0002';
export const programId = '01900000-0000-7000-8000-0000000c0001';
const uuidOf = (kind: string, n: number) =>
  `01900000-0000-7000-8000-${kind}${String(n).padStart(7, '0')}`;
export const teamUuid = (n: number) => uuidOf('0000d', n);
export const venueUuid = (n: number) => uuidOf('0000e', n);
export const importUuid = (n: number) => uuidOf('0001a', n);

export const schedulerGrant = {
  id: '01900000-0000-7000-8000-0000000000f1',
  accountId: schedulerId,
  role: 'scheduler',
  scope: { type: 'league' },
  grantedByAccountId: ownerId,
  revokedAt: null,
} as const satisfies Grant;

export const scorekeeperGrant = {
  id: '01900000-0000-7000-8000-0000000000f3',
  accountId: scorekeeperId,
  role: 'scorekeeper',
  scope: { type: 'league' },
  grantedByAccountId: ownerId,
  revokedAt: null,
} as const satisfies Grant;

export const editorGrant = {
  id: '01900000-0000-7000-8000-0000000000f4',
  accountId: editorId,
  role: 'editor',
  scope: { type: 'league' },
  grantedByAccountId: ownerId,
  revokedAt: null,
} as const satisfies Grant;

/** A game that exists in the published schedule, still to play. */
export function game(id: string, fields: Partial<GameRecord> = {}): GameRecord {
  return {
    id,
    seasonId,
    divisionId: null,
    homeTeamId: teamUuid(1),
    awayTeamId: teamUuid(2),
    startsAt: '2026-12-06T18:00:00.000Z',
    status: 'scheduled',
    captureMode: 'final',
    homeScore: null,
    awayScore: null,
    format: null,
    finalizedAt: null,
    binned: false,
    version: 1,
    ...fields,
  };
}

export function memoryImports(state: Partial<MemoryImports> = {}) {
  const db = memoryDatabase<MemoryImports>({
    status: 'draft',
    grants: [],
    activity: [],
    seasons: [{ id: seasonId, programId }],
    names: {
      teams: [1, 2, 3, 4].map((n) => ({ id: teamUuid(n), name: `Team ${n}` })),
      venues: [{ id: venueUuid(1), name: 'Main Gym', courts: ['Court 1', 'Court 2'] }],
    },
    binnedVenueIds: [],
    imports: [],
    latestRevision: null,
    draft: undefined,
    draftsStarted: 0,
    schedule: { rounds: [], games: [] },
    games: [],
    ...state,
  });
  const transaction = memoryTransaction(
    db,
    (s, jobs): ImportScoresTx => ({
      jobs,
      access: {
        ownerAccountId: async () => ownerId,
        leagueStatus: async () => s.status,
        activeGrantsOf: async (account) =>
          s.grants.filter((g) => g.accountId === account && g.revokedAt === null),
      },
      activity: { record: async (entry) => void s.activity.push(entry), list: async () => [] },
      imports: {
        findSeason: async (id) => s.seasons.find((x) => x.id === id),
        seasonNames: async () => s.names,
        insert: async (value) => {
          if (!s.seasons.some((x) => x.id === value.seasonId)) return 'no-season';
          const id = importUuid(s.imports.length + 1);
          s.imports.push({
            id,
            seasonId: value.seasonId,
            kind: 'fixtures',
            status: 'reading',
            accountId: value.accountId,
            fileName: value.fileName,
            report: value.report,
            created: { version: 1 },
            appliedAt: null,
            undoneAt: null,
            version: 1,
          });
          return { id, version: 1 };
        },
        find: async (id) => s.imports.find((x) => x.id === id),
        save: async (id, change, version) => {
          const at = s.imports.findIndex((x) => x.id === id);
          const found = s.imports[at];
          if (found === undefined || found.version !== version) return undefined;
          s.imports[at] = {
            ...found,
            status: change.status,
            report: change.report ?? found.report,
            created: change.created ?? found.created,
            appliedAt:
              change.status === 'applied'
                ? (found.appliedAt ?? '2026-11-13T12:00:00.000Z')
                : found.appliedAt,
            undoneAt: change.status === 'undone' ? '2026-11-13T13:00:00.000Z' : found.undoneAt,
            version: version + 1,
          };
          return version + 1;
        },
      },
      scheduling: {
        findSeason: async (id) => s.seasons.find((x) => x.id === id),
        latestRevision: async () => s.latestRevision,
        findDraft: async () => s.draft,
        insertDraft: async (season, changes, basedOnRevision) => {
          if (!s.seasons.some((x) => x.id === season)) return 'no-season';
          if (s.draft !== undefined) return 'exists';
          s.draftsStarted += 1;
          const id = uuidOf('0000f', s.draftsStarted);
          s.draft = { id, seasonId: season, changes, basedOnRevision, version: 1 };
          return { id, version: 1 };
        },
        updateDraft: async (_season, draftId, changes, version) => {
          if (s.draft === undefined || s.draft.id !== draftId || s.draft.version !== version) {
            return undefined;
          }
          s.draft = { ...s.draft, changes, version: version + 1 };
          return version + 1;
        },
        deleteDraft: async (_season, draftId, version) => {
          if (s.draft === undefined || s.draft.id !== draftId || s.draft.version !== version) {
            return false;
          }
          s.draft = undefined;
          return true;
        },
        loadSchedule: async () => structuredClone(s.schedule),
        teamsOfSeason: async (_season, ids) =>
          ids.filter((t) => s.names.teams.some((x) => x.id === t)),
        findVenue: async (id) => {
          const venue = s.names.venues.find((v) => v.id === id);
          return venue === undefined
            ? undefined
            : {
                id,
                name: venue.name,
                address: null,
                mapLink: null,
                binned: s.binnedVenueIds.includes(id),
                version: 1,
              };
        },
        listCourts: async (id) =>
          (s.names.venues.find((v) => v.id === id)?.courts ?? []).map((name, n) => ({
            id: uuidOf('0000a', n + 1),
            venueId: id,
            name,
            sort: n,
            binned: false,
            version: 1,
          })),
      },
      games: {
        leagueSettingRows: async () => [],
        isAssigned: async () => false,
        assign: async () => false,
        unassign: async () => false,
        listWindow: async () => ({ today: '2026-12-20', games: [] }),
        find: async (id) => s.games.find((g) => g.id === id),
        setResult: async (id, change, version) => {
          const at = s.games.findIndex((g) => g.id === id);
          const found = s.games[at];
          if (found === undefined || found.binned || found.version !== version) return undefined;
          s.games[at] = {
            ...found,
            status: change.status,
            homeScore: change.homeScore,
            awayScore: change.awayScore,
            finalizedAt: change.decided ? '2026-12-06T20:00:00.000Z' : null,
            format: found.format ?? change.format ?? null,
            captureMode: change.captureMode ?? found.captureMode,
            version: found.version + 1,
          };
          return found.version + 1;
        },
        addCorrection: async () => undefined,
        listPostponed: async () => [],
        listDecided: async () => [],
        listDecidedLines: async () => [],
        listLines: async () => [],
        replaceLines: async () => undefined,
        listRoster: async () => [],
        hasPlays: async () => false,
        findSeason: async (id) => {
          const season = s.seasons.find((x) => x.id === id);
          return season === undefined ? undefined : { programId: season.programId, rules: null };
        },
      },
    }),
  );
  const events: DomainEvent[] = [];
  const handlers: EventHandler<ImportScoresTx>[] = ['games.finalized'].map((type) => ({
    type,
    handle: async (event) => void events.push(event),
  }));
  const deps = testDeps(transaction, handlers);
  const as = (accountId: string | null) => ({ leagueId, accountId, requestId: 'request-1' });
  return { db, deps, as, events };
}

/** A made-up fixtures file of `count` games between the four teams, with scores on some rows. */
export function fixturesCsv(count: number, options: { scoreEvery?: number } = {}): string {
  const lines = ['Date,Time,Home,Away,Venue,Court,Home score,Away score'];
  const start = Date.UTC(2027, 0, 2);
  for (let n = 0; n < count; n += 1) {
    // Every game its own day and teams cycling through the four, so none clash.
    const day = new Date(start + n * 86_400_000).toISOString().slice(0, 10);
    const home = (n % 4) + 1;
    const away = ((n + 1 + (Math.floor(n / 4) % 3)) % 4) + 1;
    const scored = options.scoreEvery !== undefined && n % options.scoreEvery === 0;
    lines.push(
      `${day},18:00,Team ${home},Team ${away === home ? (home % 4) + 1 : away},Main Gym,Court ${(n % 2) + 1},${scored ? 50 + (n % 7) : ''},${scored ? 40 + (n % 5) : ''}`,
    );
  }
  return lines.join('\n');
}
