// The games module's storage on plain objects, for core's command tests. The same
// commands run against the real database in packages/database (stores and the
// two-league harness); the database's own result rules are stood in for by the
// few checks the stand-in makes.
import { defaultSeasonRules, type SeasonRules } from '@srleagues/contracts';
import {
  memoryDatabase,
  memoryTransaction,
  testDeps,
} from '../../command/testing/memory-transaction.ts';
import type { DomainEvent, EventHandler } from '../../command/index.ts';
import type { ActivityEntry, Grant } from '../access/index.ts';
import type { StoredSetting } from '../leagues/index.ts';
import { isDecided } from './game-fields.ts';
import type { GameLine, GameRecord, GamesTx, NewGameCorrection } from './ports.ts';

export type MemoryGames = {
  status: string;
  seasons: { id: string; programId: string; rules: unknown }[];
  games: GameRecord[];
  lines: GameLine[];
  corrections: NewGameCorrection[];
  grants: Grant[];
  activity: ActivityEntry[];
  /** Who is assigned to score which game. */
  assignments: { gameId: string; accountId: string }[];
  /** The league's stored setting values, by key (the league level only). */
  settings: Record<string, StoredSetting[]>;
  /** The league's today (YYYY-MM-DD); the stand-in's league keeps UTC. */
  today: string;
};

export const leagueId = '01900000-0000-7000-8000-000000000001';
export const ownerId = '01900000-0000-7000-8000-0000000000a1';
export const schedulerId = '01900000-0000-7000-8000-0000000000a2';
export const scorekeeperId = '01900000-0000-7000-8000-0000000000a3';
export const editorId = '01900000-0000-7000-8000-0000000000a4';
export const programAdminId = '01900000-0000-7000-8000-0000000000e1';
export const programScorekeeperId = '01900000-0000-7000-8000-0000000000e2';
export const seasonId = '01900000-0000-7000-8000-0000000000c1';
export const otherSeasonId = '01900000-0000-7000-8000-0000000000c2';
export const gameUuid = (n: number) =>
  `01900000-0000-7000-8000-0000000b${String(n).padStart(4, '0')}`;
export const homeTeamId = '01900000-0000-7000-8000-0000000a0001';
export const awayTeamId = '01900000-0000-7000-8000-0000000a0002';

export function rules(change: (r: SeasonRules) => void = () => {}): SeasonRules {
  const r = defaultSeasonRules();
  change(r);
  return r;
}

export function game(n: number, fields: Partial<GameRecord> = {}): GameRecord {
  return {
    id: gameUuid(n),
    seasonId,
    divisionId: null,
    homeTeamId,
    awayTeamId,
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

/** A game already final at 52 to 48, under rules of its own. */
export const finalGame = (n: number, fields: Partial<GameRecord> = {}) =>
  game(n, {
    status: 'final',
    homeScore: 52,
    awayScore: 48,
    format: rules(),
    finalizedAt: '2026-12-06T19:30:00.000Z',
    ...fields,
  });

const grantOf = (id: string, accountId: string, role: Grant['role'], scope: Grant['scope']) =>
  ({
    id: `01900000-0000-7000-8000-0000000000f${id}`,
    accountId,
    role,
    scope,
    grantedByAccountId: ownerId,
    revokedAt: null,
  }) as Grant;

export const schedulerGrant = grantOf('2', schedulerId, 'scheduler', { type: 'league' });
export const scorekeeperGrant = grantOf('3', scorekeeperId, 'scorekeeper', { type: 'league' });
export const editorGrant = grantOf('4', editorId, 'editor', { type: 'league' });
/** An admin limited to program p2, so not the program of the first season. */
export const programAdminGrant = grantOf('1', programAdminId, 'admin', {
  type: 'program',
  id: 'p2',
});
/** A scorekeeper limited to program p2, the program of the other season. */
export const programScorekeeperGrant = grantOf('5', programScorekeeperId, 'scorekeeper', {
  type: 'program',
  id: 'p2',
});

/** A season's decided games not in the bin, in id order, as the database lists them. */
export const decidedOf = (s: Pick<MemoryGames, 'games'>, season: string) =>
  s.games
    .filter((g) => g.seasonId === season && !g.binned && isDecided(g.status))
    .sort((a, b) => a.id.localeCompare(b.id));

const isAssigned = (s: Pick<MemoryGames, 'assignments'>, gameId: string, accountId: string) =>
  s.assignments.some((a) => a.gameId === gameId && a.accountId === accountId);

/** The league's stored choice of who may score (P4 §4), as setting_values keeps it. */
export const scoringRule = (value: 'anyScorekeeper' | 'assignedOnly') => ({
  'games.whoMayScore': [{ level: 'league' as const, document: { version: 1, value } }],
});

export function memoryGames(state: Partial<MemoryGames> = {}) {
  const db = memoryDatabase<MemoryGames>({
    status: 'draft',
    seasons: [
      { id: seasonId, programId: 'p1', rules: rules() },
      { id: otherSeasonId, programId: 'p2', rules: rules() },
    ],
    games: [],
    lines: [],
    corrections: [],
    grants: [],
    activity: [],
    assignments: [],
    settings: {},
    today: '2026-12-06',
    ...state,
  });
  const transaction = memoryTransaction(
    db,
    (s, jobs): GamesTx => ({
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
            finalizedAt: change.decided ? '2026-12-06T20:00:00.000Z' : null,
            format: found.format ?? change.format ?? null,
            version: found.version + 1,
          };
          return found.version + 1;
        },
        addCorrection: async (correction) => void s.corrections.push(correction),
        listPostponed: async (season) =>
          s.games
            .filter(
              (g) =>
                g.status === 'postponed' &&
                !g.binned &&
                (season === undefined || g.seasonId === season),
            )
            .sort((a, b) => (a.startsAt ?? '9').localeCompare(b.startsAt ?? '9')),
        listDecided: async (season) => decidedOf(s, season),
        listDecidedLines: async (season) => {
          const ids = new Set(decidedOf(s, season).map((g) => g.id));
          return s.lines.filter((line) => ids.has(line.gameId));
        },
        findSeason: async (id) => s.seasons.find((x) => x.id === id),
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
          const end = new Date(`${s.today}T00:00:00.000Z`);
          end.setUTCDate(end.getUTCDate() + days);
          const until = end.toISOString().slice(0, 10);
          const games = s.games
            .filter((g) => !g.binned && g.startsAt !== null)
            .map((g) => ({ g, day: (g.startsAt ?? '').slice(0, 10) }))
            .filter(({ day }) => day >= s.today && day < until)
            .sort((a, b) => (a.g.startsAt ?? '').localeCompare(b.g.startsAt ?? ''))
            .map(({ g, day }) => ({
              game: g,
              programId: s.seasons.find((x) => x.id === g.seasonId)?.programId ?? '',
              day,
              assigned: isAssigned(s, g.id, accountId),
            }));
          return { today: s.today, games };
        },
      },
    }),
  );
  const events: DomainEvent[] = [];
  const handlers: EventHandler<GamesTx>[] = ['games.finalized', 'games.reopened'].map((type) => ({
    type,
    handle: async (event) => void events.push(event),
  }));
  const deps = testDeps(transaction, handlers);
  const as = (accountId: string | null) => ({ leagueId, accountId, requestId: 'request-1' });
  return { db, deps, as, events };
}
