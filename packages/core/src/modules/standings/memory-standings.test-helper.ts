// The standings module's storage, and the games storage it asks for results, on
// plain objects for core's tests. The games commands run here too, with the standings
// handlers, as the apps run them. The same work runs against the real database in
// packages/database (stores and the two-league harness).
import { defaultSeasonRules, type SeasonRules } from '@srleagues/contracts';
import type { PlayerSeasonTotals, StandingsRow } from '@srleagues/sports';
import {
  memoryDatabase,
  memoryTransaction,
  testDeps,
} from '../../command/testing/memory-transaction.ts';
import type { EventHandler } from '../../command/index.ts';
import type { ActivityEntry, Grant } from '../access/index.ts';
import type { GameLine, GameRecord, GamesTx, NewGameCorrection } from '../games/index.ts';
import {
  standingsStores,
  type MemoryOptions,
} from '../../command/testing/memory-standings-stores.ts';
import { standingsHandlers } from './on-game-result.ts';
import type { SeasonAdjustment, StandingsStore, StandingsTx, TableTeam } from './ports.ts';

export type MemoryStandings = {
  status: string;
  seasons: { id: string; programId: string; rules: unknown }[];
  teams: (TableTeam & { seasonId: string })[];
  games: GameRecord[];
  lines: GameLine[];
  adjustments: (SeasonAdjustment & { seasonId: string; binned?: boolean })[];
  corrections: NewGameCorrection[];
  grants: Grant[];
  activity: ActivityEntry[];
  /** Saved standings rows and player totals, by season. */
  rows: Record<string, StandingsRow[]>;
  totals: Record<string, PlayerSeasonTotals[]>;
  /** Seasons locked, in order. */
  locked: string[];
};

export const leagueId = '01900000-0000-7000-8000-000000000001';
export const ownerId = '01900000-0000-7000-8000-0000000000a1';
export const adminOfOtherProgramId = '01900000-0000-7000-8000-0000000000e1';
export const schedulerId = '01900000-0000-7000-8000-0000000000a2';
export const seasonId = '01900000-0000-7000-8000-0000000000c1';
export const otherSeasonId = '01900000-0000-7000-8000-0000000000c2';
export const teamId = (n: number) =>
  `01900000-0000-7000-8000-0000000a${String(n).padStart(4, '0')}`;
export const gameId = (n: number) =>
  `01900000-0000-7000-8000-0000000b${String(n).padStart(4, '0')}`;
export const personId = (n: number) =>
  `01900000-0000-7000-8000-0000000d${String(n).padStart(4, '0')}`;
export const divisionId = '01900000-0000-7000-8000-0000000000d1';

export function rules(change: (r: SeasonRules) => void = () => {}): SeasonRules {
  const r = defaultSeasonRules();
  change(r);
  return r;
}

/** A game of the season still to play, between two teams. */
export function game(n: number, home: number, away: number, fields: Partial<GameRecord> = {}) {
  return {
    id: gameId(n),
    seasonId,
    divisionId: null,
    homeTeamId: teamId(home),
    awayTeamId: teamId(away),
    startsAt: `2026-12-${String(n).padStart(2, '0')}T18:00:00.000Z`,
    status: 'scheduled',
    captureMode: 'box',
    homeScore: null,
    awayScore: null,
    format: null,
    finalizedAt: null,
    binned: false,
    version: 1,
    ...fields,
  } satisfies GameRecord;
}

/** A player's line in a game. */
export function line(game: number, team: number, person: number, points: number): GameLine {
  return {
    gameId: gameId(game),
    teamId: teamId(team),
    personId: personId(person),
    played: true,
    secondsPlayed: 600,
    stats: { points },
  };
}

export const schedulerGrant = {
  id: '01900000-0000-7000-8000-0000000000f2',
  accountId: schedulerId,
  role: 'scheduler',
  scope: { type: 'league' },
  grantedByAccountId: ownerId,
  revokedAt: null,
} as Grant;

/** An admin limited to program p2, so not the program of the first season. */
export const otherProgramAdminGrant = {
  id: '01900000-0000-7000-8000-0000000000f1',
  accountId: adminOfOtherProgramId,
  role: 'admin',
  scope: { type: 'program', id: 'p2' },
  grantedByAccountId: ownerId,
  revokedAt: null,
} as Grant;

const byId = <T extends { id: string }>(a: T, b: T) => a.id.localeCompare(b.id);

/** Four teams in one season with no divisions. */
export const fourTeams = [1, 2, 3, 4].map((n) => ({
  teamId: teamId(n),
  divisionId: null,
  seasonId,
}));

export function memoryStandings(state: Partial<MemoryStandings> = {}, options: MemoryOptions = {}) {
  const db = memoryDatabase<MemoryStandings>({
    status: 'live',
    seasons: [
      { id: seasonId, programId: 'p1', rules: rules() },
      { id: otherSeasonId, programId: 'p2', rules: rules() },
    ],
    teams: fourTeams,
    games: [],
    lines: [],
    adjustments: [],
    corrections: [],
    grants: [],
    activity: [],
    rows: {},
    totals: {},
    locked: [],
    ...state,
  });

  const transaction = memoryTransaction(db, (s, jobs): GamesTx & StandingsTx => ({
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
    games: {
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
          finalizedAt: change.decided ? '2026-12-20T20:00:00.000Z' : null,
          format: found.format ?? change.format ?? null,
          version: found.version + 1,
        };
        return found.version + 1;
      },
      addCorrection: async (correction) => void s.corrections.push(correction),
      listPostponed: async () => [],
      ...standingsStores(s, options).games,
      // Scorekeeper assignments play no part in standings: the league keeps the
      // starting choice (any scorekeeper may score) and has none.
      leagueSettingRows: async () => [],
      isAssigned: async () => false,
      assign: async () => false,
      unassign: async () => false,
      listWindow: async () => ({ today: '2026-12-20', games: [] }),
    },
    standings: standingsStores(s, options).standings,
  }));
  const handlers: readonly EventHandler<GamesTx & StandingsTx>[] = standingsHandlers;
  // One transaction with both modules' stores and the standings handlers, as the apps
  // run every command.
  const deps = testDeps(transaction, handlers);
  const as = (accountId: string | null) => ({ leagueId, accountId, requestId: 'request-1' });
  return { db, deps, as, transaction };
}
