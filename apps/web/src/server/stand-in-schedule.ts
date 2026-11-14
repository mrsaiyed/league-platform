// THE MADE-UP SCHEDULING STORE OF THE STAND-IN LEAGUES. FOR LOCAL WORK AND TESTS ONLY.
//
// The scheduling module's own commands run here over plain objects held in this
// process's memory, one set per made-up league, so Admin → Schedule is the real page on
// the real commands with nothing behind it but this file. A transaction works on a copy
// and keeps it only if the work returns (the command throws to roll back, so a refused
// edit leaves nothing behind), as the database's does.
import type {
  AccessReader,
  ActivityEntry,
  CommandDeps,
  CourtRecord,
  DraftRecord,
  GameFacts,
  SchedulingTx,
  VenueRecord,
} from '@srleagues/core';
import type { ScheduleAdminPorts, ScheduleTeam } from './schedule-admin.ts';

type Recording = 'final-score' | 'box-score' | 'live';
type Round = { id: string; label: string; date: string | null };
type Game = {
  id: string;
  roundId: string | null;
  date: string;
  time: string | null;
  venueId: string | null;
  court: string | null;
  recording?: Recording | null;
  homeTeamId: string;
  awayTeamId: string;
  status: 'scheduled' | 'live' | 'final' | 'postponed' | 'cancelled' | 'forfeit';
};

type LeagueState = {
  seasonId: string;
  programId: string;
  teams: ScheduleTeam[];
  venues: VenueRecord[];
  courts: CourtRecord[];
  rounds: Round[];
  games: Game[];
  latestRevision: number | null;
  draft: DraftRecord | undefined;
  draftsStarted: number;
  activity: ActivityEntry[];
};

export type StandInScheduleLeague = {
  readonly leagueId: string;
  readonly seasonId: string;
  readonly teams: readonly ScheduleTeam[];
  /** How many rounds, a week apart from a week after `today`. */
  readonly rounds: number;
};

const uuid = (kind: number, n: number) =>
  `01900000-0000-7000-8000-${(kind * 0x1000000 + n).toString(16).padStart(12, '0')}`;

const addDays = (day: string, days: number): string => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const recordingOf = (mode: 'final' | 'box' | 'live'): Recording =>
  mode === 'final' ? 'final-score' : mode === 'box' ? 'box-score' : 'live';

function seed(league: StandInScheduleLeague, today: string): LeagueState {
  const venueIds = [uuid(0xe1, 1), uuid(0xe1, 2)];
  const venue = (n: number, name: string): VenueRecord => ({
    id: venueIds[n] ?? uuid(0xe1, 9),
    name,
    address: null,
    mapLink: null,
    binned: false,
    version: 1,
  });
  const court = (n: number, venueIndex: number, name: string): CourtRecord => ({
    id: uuid(0xf2, n),
    venueId: venueIds[venueIndex] ?? uuid(0xe1, 9),
    name,
    sort: n,
    binned: false,
    version: 1,
  });
  return {
    seasonId: league.seasonId,
    programId: uuid(0xc2, 1),
    teams: [...league.teams],
    venues: [venue(0, 'Central Gym'), venue(1, 'Harbor Rec Center')],
    courts: [court(1, 0, 'Court 1'), court(2, 0, 'Court 2'), court(3, 1, 'Court A')],
    rounds: Array.from({ length: league.rounds }, (_, i) => ({
      id: uuid(0xb2, i + 1),
      label: `Round ${i + 1}`,
      date: addDays(today, 7 * (i + 1)),
    })),
    games: [],
    latestRevision: null,
    draft: undefined,
    draftsStarted: 0,
    activity: [],
  };
}

export type StandInScheduleOptions = {
  readonly leagues: readonly StandInScheduleLeague[];
  /** The made-up access for one league (who holds what). */
  readonly accessFor: (leagueId: string) => AccessReader;
  readonly log: CommandDeps<SchedulingTx>['log'];
  /** The day it is, yyyy-mm-dd; round dates are counted from it. */
  readonly today: () => string;
};

export function standInSchedule(options: StandInScheduleOptions): ScheduleAdminPorts {
  const states = new Map<string, LeagueState>();
  const stateOf = (leagueId: string): LeagueState | undefined => {
    const known = states.get(leagueId);
    if (known !== undefined) return known;
    const league = options.leagues.find((l) => l.leagueId === leagueId);
    if (league === undefined) return undefined;
    const made = seed(league, options.today());
    states.set(leagueId, made);
    return made;
  };

  const txFor = (leagueId: string, s: LeagueState): SchedulingTx => ({
    jobs: { enqueue: async () => undefined },
    access: options.accessFor(leagueId),
    activity: { record: async (entry) => void s.activity.push(entry), list: async () => [] },
    scheduling: {
      findSeason: async (id) => (id === s.seasonId ? { programId: s.programId } : undefined),
      latestRevision: async () => s.latestRevision,
      findDraft: async () => s.draft,
      insertDraft: async (seasonId, changes, basedOnRevision) => {
        if (seasonId !== s.seasonId) return 'no-season';
        if (s.draft !== undefined) return 'exists';
        s.draftsStarted += 1;
        const id = uuid(0xd2, s.draftsStarted);
        s.draft = { id, seasonId, changes, basedOnRevision, version: 1 };
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
      loadSchedule: async () => structuredClone({ rounds: s.rounds, games: s.games }),
      seasonRules: async () => undefined,
      gamesById: async (_season, ids): Promise<readonly GameFacts[]> =>
        s.games
          .filter((g) => ids.includes(g.id))
          .map((g) => ({ id: g.id, status: g.status, binned: false, hasEvents: false })),
      countPeopleOnTeams: async (_season, teamIds) => teamIds.length * 10,
      insertPublishedGames: async (_season, games) => {
        for (const g of games) {
          s.games.push({
            id: g.id,
            roundId: g.roundId,
            date: g.date,
            time: g.time,
            venueId: g.venueId,
            court: g.court,
            recording: recordingOf(g.captureMode),
            homeTeamId: g.homeTeamId,
            awayTeamId: g.awayTeamId,
            status: 'scheduled',
          });
        }
      },
      updatePublishedGame: async (_season, gameId, change) => {
        const game = s.games.find((g) => g.id === gameId);
        if (game === undefined || ['live', 'final', 'forfeit'].includes(game.status)) return false;
        if (change.slot !== undefined) Object.assign(game, change.slot);
        if (change.captureMode !== undefined) game.recording = recordingOf(change.captureMode);
        return true;
      },
      binPublishedGames: async (_season, ids) => {
        const before = s.games.length;
        s.games = s.games.filter((g) => !ids.includes(g.id));
        return before - s.games.length;
      },
      updateRound: async (_season, roundId, change) => {
        const round = s.rounds.find((r) => r.id === roundId);
        if (round === undefined) return false;
        if (change.label !== undefined) round.label = change.label;
        if (change.date !== undefined) round.date = change.date;
        return true;
      },
      insertRevision: async () => {
        s.latestRevision = (s.latestRevision ?? 0) + 1;
        return true;
      },
      teamsOfSeason: async (_season, ids) => ids.filter((id) => s.teams.some((t) => t.id === id)),
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
      // The grid only reads venues and courts; changing them is the venues screen's job.
      createVenue: async () => 'name-taken',
      updateVenue: async () => undefined,
      setVenueBinned: async () => false,
      hasLiveCourts: async (id) => s.courts.some((c) => c.venueId === id && !c.binned),
      listCourts: async (id) =>
        s.courts.filter((c) => c.venueId === id && !c.binned).sort((a, b) => a.sort - b.sort),
      findCourt: async (id) => s.courts.find((c) => c.id === id),
      createCourt: async () => 'name-taken',
      updateCourt: async () => undefined,
      setCourtBinned: async () => false,
    },
  });

  const deps: CommandDeps<SchedulingTx> = {
    transaction: async (context, work) => {
      const live = stateOf(context.leagueId);
      if (live === undefined) throw new Error('The made-up schedule has no such league.');
      const copy = structuredClone(live);
      const result = await work(txFor(context.leagueId, copy));
      states.set(context.leagueId, copy);
      return result;
    },
    events: [],
    log: options.log,
    now: () => performance.now(),
  };
  return {
    deps,
    teamsOf: async (leagueId, seasonId) => {
      const s = stateOf(leagueId);
      return s === undefined || s.seasonId !== seasonId ? [] : s.teams;
    },
  };
}
