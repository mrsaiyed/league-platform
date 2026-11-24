// The scheduling module's venue and court storage on plain objects, for core's command
// tests. The same commands run against the real database in packages/database (stores and
// the two-league harness); its name rules are stood in for here.
import {
  memoryDatabase,
  memoryTransaction,
  testDeps,
} from '../../command/testing/memory-transaction.ts';
import type { ActivityEntry, Grant } from '../access/index.ts';
import type { DraftDocument } from './draft-document.ts';
import type {
  CourtRecord,
  DraftRecord,
  GameFacts,
  GameInRound,
  NewPublishedGame,
  NewRound,
  NewScheduleRevision,
  PlacePublishedGames,
  PublishedGameChange,
  SchedulingTx,
  VenueRecord,
} from './ports.ts';
import type { ScheduleState } from './rules/schedule-types.ts';

export type MemoryScheduling = {
  status: string;
  venues: VenueRecord[];
  courts: CourtRecord[];
  grants: Grant[];
  activity: ActivityEntry[];
  /** Seasons that exist, with their program. */
  seasons: { id: string; programId: string; status?: string }[];
  /** The published revision numbers of the season (a revision is published by raising this). */
  latestRevision: number | null;
  draft: DraftRecord | undefined;
  /** How many drafts have been started, for their ids. */
  draftsStarted: number;
  /** The published schedule as the rules read it. */
  schedule: ScheduleState;
  /** The teams of the season. */
  teamIds: string[];
  /** The teams of the season that have left the league (S-87). */
  leftTeamIds: string[];
  /** Games that exist besides the published schedule's (in the bin, undated, scored). */
  otherGames: GameFacts[];
  /** The season's rules as stored; none yet by default. */
  seasonRules: unknown;
  /** How many people the rosters of any teams hold, for the count. */
  people: number;
  /** What publishing wrote, in order. */
  inserted: NewPublishedGame[];
  updated: { gameId: string; change: PublishedGameChange }[];
  binned: string[];
  roundChanges: { roundId: string; label?: string; date?: string }[];
  /** Rounds publishing created and removed, in order. */
  roundsAdded: NewRound[];
  roundsRemoved: string[];
  /** Ids games of another league have: the database makes no second game with one. */
  takenElsewhere: string[];
  /** Games outside the published schedule and the bin (no date yet) and the round each is in. */
  gamesInOtherRounds: GameInRound[];
  /** Games in the bin and the round each is in: they do not hold it (S-60). */
  binnedInRounds: GameInRound[];
  /** Games in the bin that lost their round when publishing removed it, in order. */
  roundsCleared: string[];
  revisions: NewScheduleRevision[];
  /** Makes every round update find no such round, to test the refusal. */
  roundsMissing?: boolean;
  /** The published games by venue and court, as the database counts them (step 2.49). */
  placed: PlacePublishedGames[];
};

export const leagueId = '01900000-0000-7000-8000-000000000001';
export const ownerId = '01900000-0000-7000-8000-0000000000a1';
export const schedulerId = '01900000-0000-7000-8000-0000000000a2';
export const seasonId = '01900000-0000-7000-8000-0000000d0001';
export const programId = '01900000-0000-7000-8000-0000000c0001';
const uuidOf = (kind: string, n: number) =>
  `01900000-0000-7000-8000-${kind}${String(n).padStart(7, '0')}`;
export const roundUuid = (n: number) => uuidOf('0000b', n);
export const gameUuid = (n: number) => uuidOf('0000c', n);
export const draftUuid = (n: number) => uuidOf('0000e', n);
export const teamUuid = (n: number) => uuidOf('0000d', n);
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
    placed: [],
    grants: [],
    activity: [],
    seasons: [{ id: seasonId, programId }],
    latestRevision: null,
    draft: undefined,
    draftsStarted: 0,
    schedule: { rounds: [], games: [] },
    teamIds: [],
    leftTeamIds: [],
    otherGames: [],
    seasonRules: undefined,
    people: 0,
    inserted: [],
    updated: [],
    binned: [],
    roundChanges: [],
    roundsAdded: [],
    roundsRemoved: [],
    takenElsewhere: [],
    gamesInOtherRounds: [],
    binnedInRounds: [],
    roundsCleared: [],
    revisions: [],
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
        findSeason: async (id) => s.seasons.find((x) => x.id === id),
        seasonArchived: async (seasonId) =>
          s.seasons.some((x) => x.id === seasonId && x.status === 'completed'),
        latestRevision: async () => s.latestRevision,
        findDraft: async () => s.draft,
        insertDraft: async (season, changes: DraftDocument, basedOnRevision) => {
          if (!s.seasons.some((x) => x.id === season)) return 'no-season';
          if (s.draft !== undefined) return 'exists';
          s.draftsStarted += 1;
          const id = draftUuid(s.draftsStarted);
          s.draft = { id, seasonId: season, changes, basedOnRevision, version: 1 };
          return { id, version: 1 };
        },
        updateDraft: async (_season, draftId, changes: DraftDocument, version) => {
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
        seasonRules: async () => s.seasonRules,
        gamesById: async (_season, ids) => [
          ...s.schedule.games
            .filter((g) => ids.includes(g.id))
            .map((g) => ({ id: g.id, status: g.status, binned: false, hasEvents: false })),
          ...s.otherGames.filter((g) => ids.includes(g.id)),
        ],
        countPeopleOnTeams: async () => s.people,
        insertPublishedGames: async (_season, games) => {
          // An id another league's game has is not made, as on the database.
          const made = games.filter((g) => !s.takenElsewhere.includes(g.id));
          s.inserted.push(...made);
          return made.length;
        },
        updatePublishedGame: async (_season, gameId, change) => {
          const game = s.schedule.games.find((g) => g.id === gameId);
          if (game === undefined || ['live', 'final', 'forfeit'].includes(game.status)) {
            return false;
          }
          s.updated.push({ gameId, change });
          return true;
        },
        binPublishedGames: async (_season, ids) => {
          s.binned.push(...ids);
          return ids.length;
        },
        updateRound: async (_season, roundId, change) => {
          if (s.roundsMissing === true) return false;
          s.roundChanges.push({ roundId, ...change });
          return true;
        },
        insertRounds: async (_season, rounds) => {
          // As the database: a taken id or number is not added.
          const taken = [...s.schedule.rounds, ...s.roundsAdded];
          const fresh = rounds.filter(
            (r) => !taken.some((x) => x.id === r.id || x.number === r.number),
          );
          s.roundsAdded.push(...fresh);
          return fresh.length;
        },
        deleteRounds: async (_season, ids) => {
          // As delete-rounds.ts: a game publishing moved is in its new round; one in the bin
          // (binned by this publication or before) does not hold its round, and loses it.
          const roundNow = (g: { id: string; roundId: string | null }) =>
            s.updated.findLast((u) => u.gameId === g.id && u.change.slot !== undefined)?.change.slot
              ?.roundId ?? g.roundId;
          const named = new Set([
            ...s.schedule.games.filter((g) => !s.binned.includes(g.id)).map(roundNow),
            ...s.inserted.map((g) => g.roundId),
            ...s.gamesInOtherRounds.map((g) => g.roundId),
          ]);
          const gone = ids.filter((id) => !named.has(id));
          const inBin = [
            ...s.schedule.games.filter((g) => s.binned.includes(g.id)),
            ...s.binnedInRounds,
          ];
          const cleared = inBin
            .filter((g) => g.roundId !== null && gone.includes(g.roundId))
            .map((g) => g.id);
          s.roundsCleared.push(...cleared);
          s.roundsRemoved.push(...gone);
          return { roundIds: [...gone].sort(), gameIds: [...cleared].sort() };
        },
        // As list-games-in-rounds.ts: games not in the bin, dated or not.
        gamesInRounds: async (_season, ids) => [
          ...s.schedule.games
            .filter((g) => g.roundId !== null && ids.includes(g.roundId))
            .map((g) => ({ id: g.id, roundId: g.roundId ?? '' })),
          ...s.gamesInOtherRounds.filter((g) => ids.includes(g.roundId)),
        ],
        insertRevision: async (_season, revision) => {
          if (s.latestRevision !== null && revision.number <= s.latestRevision) return false;
          s.revisions.push(revision);
          s.latestRevision = revision.number;
          return true;
        },
        teamsOfSeason: async (_season, ids) => ids.filter((t) => s.teamIds.includes(t)),
        leftTeamsOfSeason: async (_season, ids) => ids.filter((t) => s.leftTeamIds.includes(t)),
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
        placeGames: async () => ({
          published: structuredClone(s.placed),
          drafts:
            s.draft === undefined ? [] : [{ seasonId: s.draft.seasonId, changes: s.draft.changes }],
        }),
      },
    };
  });
  const deps = testDeps(transaction);
  const as = (accountId: string | null) => ({ leagueId, accountId, requestId: 'request-1' });
  return { db, deps, as };
}
