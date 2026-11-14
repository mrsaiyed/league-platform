// THE GAMES AREA'S LOCAL STAND-IN. FOR LOCAL WORK AND TESTS ONLY, NEVER FOR PRODUCTION.
//
// Made-up games in this process's memory (T-201), so the admin's games area can be opened
// and used with no database. It runs the real games commands over an in-memory games
// store, so what they refuse and record is what the database-backed store is held to.
// Like the database, a transaction works on a copy and keeps it only if the work returns,
// and transactions run one at a time, so two at once cannot lose either's work.
// Only one made-up league has games; every other league has none. The tracker's
// endpoints (step 2.32) run on the same games, with made-up rosters (stand-in-tracker.ts).
import { defaultSeasonRules } from '@srleagues/contracts';
import {
  defaultNamePolicy,
  systemClock,
  type AccessReader,
  type ActivityEntry,
  type CommandDeps,
  type CommandLogLine,
  type EventHandler,
  type GameRecord,
  type GameSnapshotStore,
  type GamesTx,
  type NewGameCorrection,
  type StoredSetting,
  type TrackerTx,
  type TransactionRunner,
} from '@srleagues/core';
import type { GameNames, GamesAreaPorts } from './games-area-ports.ts';
import {
  emptyTracker,
  liveGamesOf,
  scoringSessionsOf,
  seedTracker,
  type MadeUpTeam,
  type TrackerState,
} from './stand-in-tracker.ts';
import type { TrackerPorts } from './tracker-ports.ts';

const id = (kind: number, n: number) =>
  `01900000-0000-7000-8000-${kind.toString(16).padStart(4, '0')}${n.toString(16).padStart(8, '0')}`;

type State = {
  seasons: {
    id: string;
    programId: string;
    rules: unknown;
    status: 'draft' | 'active' | 'completed';
  }[];
  games: GameRecord[];
  /** Games whose plays the tracker recorded before this process started (no plays kept
   * here); a game the tracker writes to here counts too (`tracker.events`). */
  tracked: string[];
  corrections: NewGameCorrection[];
  assignments: { gameId: string; accountId: string }[];
  settings: Record<string, StoredSetting[]>;
  activity: ActivityEntry[];
  tracker: TrackerState;
};

export type StandInGamesOptions = {
  /** The league the made-up games belong to. */
  readonly leagueId: string;
  /** The made-up people's names, by account id, for the scorekeeper shown on a game. */
  readonly people: Readonly<Record<string, string>>;
  /** Two accounts to give games to: the first scores three of them, the second one. */
  readonly assignees: readonly [string, string];
  /** The league's access reads (owner, state, grants), the same the shell uses. */
  readonly accessOf: (leagueId: string) => AccessReader;
  readonly log: (line: CommandLogLine) => void;
  /** The league's own stored settings to start with, by key (for checks). */
  readonly settings?: Readonly<Record<string, StoredSetting[]>>;
};

const teamNames: Readonly<Record<string, string>> = {
  [id(0x7e, 1)]: 'Lions',
  [id(0x7e, 2)]: 'Tigers',
  [id(0x7e, 3)]: 'Hawks',
  [id(0x7e, 4)]: 'Bears',
};
const [lions, tigers, hawks, bears] = Object.keys(teamNames) as [string, string, string, string];

const player = (firstName: string, lastName: string) => ({ firstName, lastName });
/** The made-up rosters. The Bears show their players' numbers to their staff only (S-22). */
const madeUpTeams: readonly MadeUpTeam[] = [
  {
    id: lions,
    name: 'Lions',
    slug: 'lions',
    statsVisibility: 'everyone',
    players: ['Ada', 'Ben', 'Cy', 'Dee', 'Eli', 'Fay'].map((n) => player(n, 'Lionel')),
  },
  {
    id: tigers,
    name: 'Tigers',
    slug: 'tigers',
    statsVisibility: 'everyone',
    players: ['Gus', 'Hal', 'Ivy', 'Jo', 'Kit', 'Lu'].map((n) => player(n, 'Tigerton')),
  },
  {
    id: hawks,
    name: 'Hawks',
    slug: 'hawks',
    statsVisibility: 'everyone',
    players: ['Max', 'Ned', 'Oz', 'Pia', 'Quin', 'Ray'].map((n) => player(n, 'Hawkins')),
  },
  {
    id: bears,
    name: 'Bears',
    slug: 'bears',
    statsVisibility: 'staff',
    players: ['Sol', 'Tam', 'Uma', 'Vic', 'Wes', 'Xan'].map((n) => player(n, 'Bearsley')),
  },
];

/** A made-up player's person id: team 1 to 4 (Lions, Tigers, Hawks, Bears), player 1 to 6. */
export const standInPlayerId = (team: number, n: number) => id(0x70 + team, n);

/** An ISO time `days` days from now at this hour (UTC), so the games are always this week's. */
function at(days: number, hour: number): string {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + days);
  day.setUTCHours(hour, 0, 0, 0);
  return day.toISOString();
}

function emptyState(): State {
  return {
    seasons: [],
    games: [],
    tracked: [],
    corrections: [],
    assignments: [],
    settings: {},
    activity: [],
    tracker: emptyTracker(),
  };
}

function seed(options: StandInGamesOptions): State {
  const seasonId = id(0x5e, 1);
  /** A season still being set up, with one game and no date yet (hidden from the public). */
  const draftSeasonId = id(0x5e, 2);
  const game = (n: number, fields: Partial<GameRecord>): GameRecord => ({
    id: id(0x6a, n),
    seasonId,
    divisionId: null,
    homeTeamId: lions,
    awayTeamId: tigers,
    startsAt: at(0, 18),
    status: 'scheduled',
    captureMode: 'final',
    homeScore: null,
    awayScore: null,
    format: null,
    finalizedAt: null,
    binned: false,
    version: 1,
    ...fields,
  });
  const [first, second] = options.assignees;
  return {
    ...emptyState(),
    tracker: seedTracker(madeUpTeams, standInPlayerId),
    settings: { ...options.settings },
    // The live game has plays from the tracker.
    tracked: [id(0x6a, 2)],
    seasons: [
      { id: seasonId, programId: id(0x9a, 1), rules: defaultSeasonRules(), status: 'active' },
      {
        id: draftSeasonId,
        programId: id(0x9a, 1),
        rules: defaultSeasonRules(),
        status: 'draft',
      },
    ],
    games: [
      game(1, {}),
      game(2, { homeTeamId: hawks, awayTeamId: bears, status: 'live', captureMode: 'live' }),
      game(3, { homeTeamId: hawks, awayTeamId: lions, startsAt: at(1, 19), captureMode: 'live' }),
      game(4, { homeTeamId: tigers, awayTeamId: bears, startsAt: at(2, 18) }),
      game(5, {
        homeTeamId: bears,
        awayTeamId: lions,
        startsAt: at(0, 9),
        status: 'final',
        homeScore: 44,
        awayScore: 50,
        format: defaultSeasonRules(),
        finalizedAt: at(0, 10),
        version: 2,
      }),
      game(6, { seasonId: draftSeasonId, startsAt: null }),
    ],
    assignments: [
      { gameId: id(0x6a, 1), accountId: first },
      { gameId: id(0x6a, 2), accountId: first },
      { gameId: id(0x6a, 4), accountId: second },
    ],
  };
}

/** The seasons whose games the public may read, as the database store reads them
 * (games-read-store.ts, publicSeasonStatuses). */
const publicSeasonStatuses: readonly string[] = ['active', 'completed'];

const isAssigned = (s: State, gameId: string, accountId: string) =>
  s.assignments.some((a) => a.gameId === gameId && a.accountId === accountId);

/** The games area's ports, and the tracker's but for the live publisher, which the app adds. */
export type StandInGames = GamesAreaPorts & {
  readonly tracker: Omit<TrackerPorts, 'publisher'>;
};

export function standInGames(options: StandInGamesOptions): StandInGames {
  let state = seed(options);
  const stateOf = (leagueId: string) => (leagueId === options.leagueId ? state : emptyState());
  const teamsOf = (s: State, gameId: string) => {
    const game = s.games.find((g) => g.id === gameId);
    return game === undefined ? [] : [game.homeTeamId, game.awayTeamId];
  };

  const txOf = (leagueId: string, s: State): TrackerTx => ({
    jobs: { enqueue: async () => {} },
    access: options.accessOf(leagueId),
    activity: { record: async (entry) => void s.activity.push(entry), list: async () => [] },
    games: {
      find: async (gameId) => s.games.find((g) => g.id === gameId),
      setResult: async (gameId, change, version) => {
        const index = s.games.findIndex((g) => g.id === gameId);
        const found = s.games[index];
        if (found === undefined || found.binned || found.version !== version) return undefined;
        s.games[index] = {
          ...found,
          status: change.status,
          homeScore: change.homeScore,
          awayScore: change.awayScore,
          finalizedAt: change.decided ? new Date().toISOString() : null,
          format: found.format ?? change.format ?? null,
          captureMode: change.captureMode ?? found.captureMode,
          version: found.version + 1,
        };
        return found.version + 1;
      },
      addCorrection: async (correction) => void s.corrections.push(correction),
      listPostponed: async (seasonId) =>
        s.games.filter(
          (g) =>
            g.status === 'postponed' &&
            !g.binned &&
            (seasonId === undefined || g.seasonId === seasonId),
        ),
      listDecided: async (seasonId) =>
        s.games.filter(
          (g) =>
            g.seasonId === seasonId &&
            !g.binned &&
            (g.status === 'final' || g.status === 'forfeit'),
        ),
      listDecidedLines: async () => [],
      // Box score lines, with the number worn, are the tracker's lines (one table, as in
      // the database), so the grid and the tracker read and write the same ones.
      listLines: async (gameId) =>
        s.tracker.lines
          .filter((l) => l.gameId === gameId)
          .map(({ jerseyNumber: _jersey, ...line }) => line),
      replaceLines: async (gameId, lines) => {
        s.tracker.lines = [...s.tracker.lines.filter((l) => l.gameId !== gameId), ...lines];
      },
      listRoster: async (gameId) =>
        teamsOf(s, gameId).flatMap((teamId) =>
          s.tracker.players
            .filter((p) => p.teamId === teamId)
            .map((p) => {
              const person = s.tracker.people.find((x) => x.id === p.personId);
              return {
                teamId,
                personId: p.personId,
                firstName: person?.firstName ?? '',
                lastName: person?.lastName ?? '',
                jerseyNumber: p.jerseyNumber,
                left: !p.onGameDay,
              };
            }),
        ),
      hasPlays: async (gameId) =>
        s.tracked.includes(gameId) || s.tracker.events.some((e) => e.gameId === gameId),
      findSeason: async (seasonId) => s.seasons.find((x) => x.id === seasonId),
      leagueSettingRows: async (key) => s.settings[key] ?? [],
      isAssigned: async (gameId, accountId) => isAssigned(s, gameId, accountId),
      assign: async (gameId, accountId) => {
        if (isAssigned(s, gameId, accountId)) return false;
        s.assignments.push({ gameId, accountId });
        return true;
      },
      unassign: async (gameId, accountId) => {
        if (!isAssigned(s, gameId, accountId)) return false;
        s.assignments = s.assignments.filter(
          (a) => !(a.gameId === gameId && a.accountId === accountId),
        );
        return true;
      },
      listWindow: async (accountId, days) => {
        const today = new Date().toISOString().slice(0, 10);
        const end = new Date(`${today}T00:00:00.000Z`);
        end.setUTCDate(end.getUTCDate() + days);
        const until = end.toISOString().slice(0, 10);
        return {
          today,
          games: s.games
            .filter((g) => !g.binned && g.startsAt !== null)
            .map((g) => ({ g, day: (g.startsAt ?? '').slice(0, 10) }))
            .filter(({ day }) => day >= today && day < until)
            .sort((a, b) => (a.g.startsAt ?? '').localeCompare(b.g.startsAt ?? ''))
            .map(({ g, day }) => ({
              game: g,
              programId: s.seasons.find((x) => x.id === g.seasonId)?.programId ?? '',
              day,
              assigned: isAssigned(s, g.id, accountId),
            })),
        };
      },
    },
    clock: systemClock,
    scoringSessions: scoringSessionsOf(s.tracker, (gameId) => s.games.some((g) => g.id === gameId)),
    liveGames: liveGamesOf(s.tracker, (gameId) => teamsOf(s, gameId)),
  });

  const noticeOnly: EventHandler<GamesTx>[] = ['games.finalized', 'games.reopened'].map((type) => ({
    type,
    handle: async () => {},
  }));
  // One transaction at a time, as the database's lock on a game would hold the others.
  let queue: Promise<unknown> = Promise.resolve();
  const transaction: TransactionRunner<TrackerTx> = (context, work) => {
    const run = queue.then(async () => {
      const draft = structuredClone(stateOf(context.leagueId));
      const result = await work(txOf(context.leagueId, draft));
      // Kept only when the command succeeded: a refusal leaves nothing behind.
      const refused =
        typeof result === 'object' && result !== null && 'ok' in result && result.ok === false;
      if (!refused && context.leagueId === options.leagueId) state = draft;
      return result;
    });
    queue = run.catch(() => undefined);
    return run;
  };
  const deps: CommandDeps<GamesTx> = {
    transaction,
    events: noticeOnly,
    log: options.log,
    now: () => performance.now(),
  };
  const snapshotStoreOf = (leagueId: string): GameSnapshotStore => {
    const s = () => stateOf(leagueId);
    return {
      // A game of a season still being set up (or retired) is not there at all, as in
      // the database store (games-read-store.ts).
      findGame: async (gameId) => {
        const game = s().games.find((g) => g.id === gameId);
        const season = s().seasons.find((x) => x.id === game?.seasonId);
        return season === undefined || !publicSeasonStatuses.includes(season.status)
          ? undefined
          : game;
      },
      teams: async (teamIds) => s().tracker.teams.filter((t) => teamIds.includes(t.id)),
      state: async (gameId) => s().tracker.states.find((x) => x.gameId === gameId)?.state,
      savedState: async (gameId) => {
        const found = s().tracker.states.find((x) => x.gameId === gameId);
        return found === undefined ? undefined : { seq: found.seq, state: found.state };
      },
      // Every rostered player of the game's teams, with their number, as the database
      // reads a game's lines once the tracker has written them.
      lines: async (gameId) => {
        const teams = teamsOf(s(), gameId);
        const saved = s().tracker.lines.filter((l) => l.gameId === gameId);
        return s()
          .tracker.players.filter((p) => teams.includes(p.teamId))
          .map((p) => {
            const line = saved.find((l) => l.personId === p.personId);
            return {
              teamId: p.teamId,
              personId: p.personId,
              jerseyNumber: line?.jerseyNumber ?? p.jerseyNumber,
              played: line?.played ?? false,
              secondsPlayed: line?.secondsPlayed ?? null,
              stats: line?.stats ?? {},
            };
          });
      },
      people: async (personIds) => s().tracker.people.filter((p) => personIds.includes(p.id)),
      correctedOn: async () => undefined,
    };
  };
  return {
    deps,
    tracker: {
      deps: { transaction, events: [], log: options.log, now: () => performance.now() },
      snapshotStoreOf,
      namesShownOf: async () => ({ audience: 'adult', policy: defaultNamePolicy }),
      displayNameOf: async (leagueId, accountId) =>
        leagueId === options.leagueId ? (options.people[accountId] ?? '') : '',
      clock: systemClock,
    },
    namesOf: async (leagueId): Promise<GameNames> => {
      if (leagueId !== options.leagueId) return { teams: {}, scorekeepers: {} };
      const scorekeepers: Record<string, string[]> = {};
      for (const a of state.assignments) {
        (scorekeepers[a.gameId] ??= []).push(options.people[a.accountId] ?? '');
      }
      return { teams: teamNames, scorekeepers };
    },
  };
}
