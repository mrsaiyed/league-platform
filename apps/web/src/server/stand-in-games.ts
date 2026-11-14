// THE GAMES AREA'S LOCAL STAND-IN. FOR LOCAL WORK AND TESTS ONLY, NEVER FOR PRODUCTION.
//
// Made-up games in this process's memory (T-201), so the admin's games area can be opened
// and used with no database. It runs the real games commands over an in-memory games
// store, so what they refuse and record is what the database-backed store is held to.
// Like the database, a transaction works on a copy and keeps it only if the work returns.
// Only one made-up league has games; every other league has none.
import { defaultSeasonRules } from '@srleagues/contracts';
import type {
  AccessReader,
  ActivityEntry,
  CommandDeps,
  CommandLogLine,
  EventHandler,
  GameLine,
  GameRecord,
  GamesTx,
  NewGameCorrection,
  StoredSetting,
} from '@srleagues/core';
import type { GameNames, GamesAreaPorts } from './games-area-ports.ts';

const id = (kind: number, n: number) =>
  `01900000-0000-7000-8000-${kind.toString(16).padStart(4, '0')}${n.toString(16).padStart(8, '0')}`;

type State = {
  seasons: { id: string; programId: string; rules: unknown }[];
  games: GameRecord[];
  lines: GameLine[];
  corrections: NewGameCorrection[];
  assignments: { gameId: string; accountId: string }[];
  settings: Record<string, StoredSetting[]>;
  activity: ActivityEntry[];
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
    lines: [],
    corrections: [],
    assignments: [],
    settings: {},
    activity: [],
  };
}

function seed(options: StandInGamesOptions): State {
  const seasonId = id(0x5e, 1);
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
    settings: { ...options.settings },
    seasons: [{ id: seasonId, programId: id(0x9a, 1), rules: defaultSeasonRules() }],
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
    ],
    assignments: [
      { gameId: id(0x6a, 1), accountId: first },
      { gameId: id(0x6a, 2), accountId: first },
      { gameId: id(0x6a, 4), accountId: second },
    ],
  };
}

const isAssigned = (s: State, gameId: string, accountId: string) =>
  s.assignments.some((a) => a.gameId === gameId && a.accountId === accountId);

export function standInGames(options: StandInGamesOptions): GamesAreaPorts {
  let state = seed(options);
  const stateOf = (leagueId: string) => (leagueId === options.leagueId ? state : emptyState());

  const txOf = (leagueId: string, s: State): GamesTx => ({
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
  });

  const noticeOnly: EventHandler<GamesTx>[] = ['games.finalized', 'games.reopened'].map((type) => ({
    type,
    handle: async () => {},
  }));
  const deps: CommandDeps<GamesTx> = {
    transaction: async (context, work) => {
      const draft = structuredClone(stateOf(context.leagueId));
      const result = await work(txOf(context.leagueId, draft));
      // Kept only when the command succeeded: a refusal leaves nothing behind.
      const refused =
        typeof result === 'object' && result !== null && 'ok' in result && result.ok === false;
      if (!refused && context.leagueId === options.leagueId) state = draft;
      return result;
    },
    events: noticeOnly,
    log: options.log,
    now: () => performance.now(),
  };
  return {
    deps,
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
