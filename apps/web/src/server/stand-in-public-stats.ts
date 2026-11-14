// THE MADE-UP STANDINGS AND STATISTICS OF THE STAND-IN LEAGUES. FOR LOCAL WORK AND TESTS ONLY.
//
// Plain objects behind core's StandingsReadStore, so the standings and statistics pages
// run the same core queries here as they will on the database. One league has two
// divisions, an adjustment, a tie settled by head-to-head and a team whose players'
// numbers are staff only; the other has one table ranked by points and shows its
// children by first name and last initial.
import {
  defaultNamePolicy,
  type PersonDisplayRecord,
  type StandingsReadStore,
} from '@srleagues/core';
import { defaultSeasonRules, SeasonRules } from '@srleagues/contracts';
import type { PublicSeason, PublicStatsPorts, PublicStatsSettings } from './public-stats.ts';

const id = (kind: number, n: number) =>
  `01900000-0000-7000-8000-${(kind * 0x1000000 + n).toString(16).padStart(12, '0')}`;
const season = (n: number) => id(0xc1, n);
const division = (n: number) => id(0xd1, n);
const team = (n: number) => id(0xa1, n);
const person = (n: number) => id(0xf1, n);

type Row = {
  team: string;
  division: string | null;
  rank: number;
  seed: number;
  w: number;
  l: number;
  pf: number;
  pa: number;
  points?: number;
  streak?: ['won' | 'lost', number];
  decidedBy?: string;
};

type Team = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  division: string | null;
  visibility: 'everyone' | 'staff';
};

type Player = {
  id: string;
  first: string;
  last: string;
  teamId: string;
  games: number;
  points: number;
  fouls: number;
  rebounds: number;
};

type SeasonData = {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'completed';
  isCurrent: boolean;
  rules: unknown;
  statKeys: string[];
  divisions: { id: string; name: string; sort: number }[];
  teams: Team[];
  rows: Row[];
  adjustments: {
    teamId: string;
    wins: number;
    losses: number;
    ties: number;
    points: number;
    reason: string;
  }[];
  players: Player[];
};

function storeOf(data: SeasonData[]): StandingsReadStore {
  const of = (seasonId: string) => data.find((s) => s.id === seasonId);
  const people = data.flatMap((s) => s.players);
  return {
    findSeason: async (seasonId) => {
      const found = of(seasonId);
      return found === undefined
        ? undefined
        : { id: found.id, name: found.name, rules: found.rules };
    },
    seasonStatKeys: async (seasonId) => of(seasonId)?.statKeys,
    teams: async (seasonId) =>
      (of(seasonId)?.teams ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        color: t.color,
        divisionId: t.division,
        statsVisibility: t.visibility,
      })),
    divisions: async (seasonId) =>
      (of(seasonId)?.divisions ?? []).map((d) => ({ ...d, color: null })),
    standingsRows: async (seasonId) =>
      (of(seasonId)?.rows ?? []).map((r) => ({
        teamId: r.team,
        divisionId: r.division,
        rank: r.rank,
        seed: r.seed,
        gamesPlayed: r.w + r.l,
        wins: r.w,
        losses: r.l,
        ties: 0,
        pointsFor: r.pf,
        pointsAgainst: r.pa,
        standingsPoints: r.points ?? null,
        streakResult: r.streak?.[0] ?? null,
        streakLength: r.streak?.[1] ?? null,
        decidedBy: r.decidedBy ?? null,
      })),
    adjustments: async (seasonId) =>
      (of(seasonId)?.adjustments ?? []).map((a, i) => ({ id: id(0xad, i + 1), ...a })),
    playerTotals: async (seasonId) =>
      (of(seasonId)?.players ?? []).map((p) => ({
        personId: p.id,
        gamesPlayed: p.games,
        secondsPlayed: 0,
        secondsGames: 0,
        stats: {
          stats: {
            points: { total: p.points, gamesRecorded: p.games },
            rebounds: { total: p.rebounds, gamesRecorded: p.games },
            fouls: { total: p.fouls, gamesRecorded: p.games },
          },
        },
      })),
    playerTeams: async (seasonId) =>
      (of(seasonId)?.players ?? []).map((p) => ({ personId: p.id, teamId: p.teamId })),
    decidedGamesOf: async () => [],
    teamStatTotals: async (seasonId) =>
      (of(seasonId)?.teams ?? []).flatMap((t) => {
        const own = (of(seasonId)?.players ?? []).filter((p) => p.teamId === t.id);
        const games = Math.max(0, ...own.map((p) => p.games));
        return (['points', 'rebounds', 'fouls'] as const).map((key) => ({
          teamId: t.id,
          statKey: key,
          total: own.reduce((sum, p) => sum + p[key], 0),
          gamesRecorded: games,
        }));
      }),
    people: async (personIds) =>
      people
        .filter((p) => personIds.includes(p.id))
        .map(
          (p): PersonDisplayRecord => ({
            id: p.id,
            firstName: p.first,
            lastName: p.last,
            isMinor: null,
            visibility: 'none',
          }),
        ),
  };
}

const win = SeasonRules.parse(defaultSeasonRules());
const byPoints = SeasonRules.parse({
  ...defaultSeasonRules(),
  standings: { ...win.standings, rankBy: 'points', columns: [...win.standings.columns, 'points'] },
});

const adultTeams: Team[] = [
  {
    id: team(1),
    name: 'Falcons',
    slug: 'falcons',
    color: '#b3262d',
    division: division(1),
    visibility: 'everyone',
  },
  {
    id: team(2),
    name: 'Herons',
    slug: 'herons',
    color: '#1d6f5f',
    division: division(1),
    visibility: 'everyone',
  },
  {
    id: team(3),
    name: 'Owls',
    slug: 'owls',
    color: '#5b3f9a',
    division: division(1),
    visibility: 'staff',
  },
  {
    id: team(4),
    name: 'Badgers',
    slug: 'badgers',
    color: '#444444',
    division: division(2),
    visibility: 'everyone',
  },
  {
    id: team(5),
    name: 'Otters',
    slug: 'otters',
    color: '#0d6efd',
    division: division(2),
    visibility: 'everyone',
  },
];

const adultFall: SeasonData = {
  id: season(1),
  name: 'Fall 2026',
  slug: 'fall-2026',
  status: 'active',
  isCurrent: true,
  rules: win,
  statKeys: ['points', 'rebounds', 'fouls'],
  divisions: [
    { id: division(1), name: 'East', sort: 0 },
    { id: division(2), name: 'West', sort: 1 },
  ],
  teams: adultTeams,
  rows: [
    {
      team: team(3),
      division: division(1),
      rank: 1,
      seed: 1,
      w: 5,
      l: 1,
      pf: 410,
      pa: 350,
      streak: ['won', 4],
      decidedBy: 'head-to-head',
    },
    {
      team: team(1),
      division: division(1),
      rank: 2,
      seed: 2,
      w: 5,
      l: 1,
      pf: 402,
      pa: 360,
      streak: ['lost', 1],
    },
    { team: team(2), division: division(1), rank: 3, seed: 3, w: 2, l: 4, pf: 330, pa: 380 },
    {
      team: team(4),
      division: division(2),
      rank: 1,
      seed: 1,
      w: 4,
      l: 2,
      pf: 370,
      pa: 340,
      streak: ['won', 2],
    },
    {
      team: team(5),
      division: division(2),
      rank: 2,
      seed: 2,
      w: 1,
      l: 5,
      pf: 300,
      pa: 390,
      streak: ['lost', 3],
    },
  ],
  adjustments: [
    {
      teamId: team(5),
      wins: -1,
      losses: 0,
      ties: 0,
      points: 0,
      reason: 'Played an ineligible player in round 3.',
    },
  ],
  players: [
    {
      id: person(1),
      first: 'Dana',
      last: 'Whitfield',
      teamId: team(1),
      games: 6,
      points: 138,
      fouls: 9,
      rebounds: 30,
    },
    {
      id: person(2),
      first: 'Marcus',
      last: 'Oyelaran',
      teamId: team(1),
      games: 5,
      points: 72,
      fouls: 12,
      rebounds: 41,
    },
    {
      id: person(3),
      first: 'Priya',
      last: 'Raman',
      teamId: team(2),
      games: 6,
      points: 101,
      fouls: 6,
      rebounds: 24,
    },
    {
      id: person(4),
      first: 'Theo',
      last: 'Lindqvist',
      teamId: team(2),
      games: 1,
      points: 30,
      fouls: 0,
      rebounds: 2,
    },
    {
      id: person(5),
      first: 'Jordan',
      last: 'Castellanos',
      teamId: team(3),
      games: 6,
      points: 150,
      fouls: 8,
      rebounds: 36,
    },
    {
      id: person(6),
      first: 'Imani',
      last: 'Brooks',
      teamId: team(3),
      games: 6,
      points: 88,
      fouls: 10,
      rebounds: 52,
    },
    {
      id: person(7),
      first: 'Wen',
      last: 'Zhao',
      teamId: team(4),
      games: 6,
      points: 119,
      fouls: 7,
      rebounds: 33,
    },
    {
      id: person(8),
      first: 'Ravi',
      last: 'Patel',
      teamId: team(5),
      games: 6,
      points: 95,
      fouls: 14,
      rebounds: 28,
    },
  ],
};

const adultSpring: SeasonData = {
  id: season(2),
  name: 'Spring 2026',
  slug: 'spring-2026',
  status: 'completed',
  isCurrent: false,
  rules: win,
  statKeys: ['points', 'rebounds', 'fouls'],
  divisions: [],
  teams: adultTeams.map((t) => ({ ...t, division: null, visibility: 'everyone' })),
  rows: [
    { team: team(2), division: null, rank: 1, seed: 1, w: 8, l: 2, pf: 640, pa: 560 },
    { team: team(1), division: null, rank: 2, seed: 2, w: 6, l: 4, pf: 610, pa: 590 },
    { team: team(4), division: null, rank: 3, seed: 3, w: 3, l: 7, pf: 540, pa: 600 },
  ],
  adjustments: [],
  players: [
    {
      id: person(3),
      first: 'Priya',
      last: 'Raman',
      teamId: team(2),
      games: 10,
      points: 190,
      fouls: 11,
      rebounds: 40,
    },
    {
      id: person(1),
      first: 'Dana',
      last: 'Whitfield',
      teamId: team(1),
      games: 10,
      points: 176,
      fouls: 15,
      rebounds: 55,
    },
  ],
};

const youthTeams: Team[] = [
  {
    id: team(11),
    name: 'Comets',
    slug: 'comets',
    color: '#e07b00',
    division: null,
    visibility: 'everyone',
  },
  {
    id: team(12),
    name: 'Rockets',
    slug: 'rockets',
    color: '#2a4fd6',
    division: null,
    visibility: 'everyone',
  },
  {
    id: team(13),
    name: 'Meteors',
    slug: 'meteors',
    color: null,
    division: null,
    visibility: 'everyone',
  },
];

const youthSeason: SeasonData = {
  id: season(3),
  name: 'Winter',
  slug: 'winter',
  status: 'active',
  isCurrent: true,
  rules: byPoints,
  statKeys: ['points', 'rebounds', 'fouls'],
  divisions: [],
  teams: youthTeams,
  rows: [
    {
      team: team(11),
      division: null,
      rank: 1,
      seed: 1,
      w: 3,
      l: 1,
      pf: 120,
      pa: 98,
      points: 6,
      streak: ['won', 2],
    },
    {
      team: team(12),
      division: null,
      rank: 2,
      seed: 2,
      w: 2,
      l: 2,
      pf: 110,
      pa: 111,
      points: 4,
      decidedBy: 'still-tied',
    },
    {
      team: team(13),
      division: null,
      rank: 2,
      seed: 3,
      w: 2,
      l: 2,
      pf: 101,
      pa: 102,
      points: 4,
      decidedBy: 'still-tied',
    },
  ],
  adjustments: [],
  players: [
    {
      id: person(21),
      first: 'Sam',
      last: 'Rivera',
      teamId: team(11),
      games: 4,
      points: 52,
      fouls: 5,
      rebounds: 18,
    },
    {
      id: person(22),
      first: 'Noor',
      last: 'Haddad',
      teamId: team(12),
      games: 4,
      points: 44,
      fouls: 3,
      rebounds: 22,
    },
    {
      id: person(23),
      first: 'Eli',
      last: 'Okafor',
      teamId: team(13),
      games: 1,
      points: 20,
      fouls: 1,
      rebounds: 4,
    },
  ],
};

const bySeasonOf = (all: SeasonData[]): PublicSeason[] =>
  all.map((s) => ({ id: s.id, name: s.name, slug: s.slug, isCurrent: s.isCurrent }));

/**
 * The made-up standings and statistics for two leagues, given their ids: an adult league
 * with divisions and a youth league without. Any other league has no seasons.
 */
export function standInPublicStats(ids: {
  readonly adultLeagueId: string;
  readonly youthLeagueId: string;
}): PublicStatsPorts {
  const data = (leagueId: string): SeasonData[] =>
    leagueId === ids.adultLeagueId
      ? [adultFall, adultSpring]
      : leagueId === ids.youthLeagueId
        ? [youthSeason]
        : [];
  const settings = (leagueId: string): PublicStatsSettings =>
    leagueId === ids.youthLeagueId
      ? { audience: 'youth', namePolicy: defaultNamePolicy, minimumGames: 2 }
      : { audience: 'adult', namePolicy: defaultNamePolicy, minimumGames: 3 };
  return {
    seasonsOf: async (leagueId) => bySeasonOf(data(leagueId)),
    settingsOf: async (leagueId) => settings(leagueId),
    readStoreOf: (leagueId) => storeOf(data(leagueId)),
  };
}
