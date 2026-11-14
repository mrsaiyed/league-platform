// THE MADE-UP SCHEDULES OF THE STAND-IN LEAGUES. FOR LOCAL WORK AND TESTS ONLY.
//
// Plain data behind the same shapes the database query (step 2.39) returns, so the home
// and schedule pages run the same code here as they will on the database. Round dates
// are counted from the league's own "today", so past, current and upcoming rounds are
// always there however late it is run. One league has two games a round, a game that
// went live, a forfeit and a postponement; the other has one game a round, named
// rounds, and a make-up game with no round and no time yet.
import {
  placeRounds,
  type PublicGame,
  type PublicGameTeam,
  type PublicSchedule,
  type PublicSeasonChoice,
} from '@srleagues/core';
import type { LeagueClock, PublicSchedulePorts } from './public-schedule.ts';
import { adultTeams, standInSeasonIds, youthTeams } from './stand-in-public-stats.ts';

type Where = { venue: string; address: string; court: string };

type GameSpec = {
  /** Index into the rounds list; null for a game with no round. */
  round: number | null;
  hour: number | null;
  home: string;
  away: string;
  status: PublicGame['status'];
  score?: [number, number];
  where: Where;
};

type RoundSpec = { daysFromToday: number; label: string | null };

type SeasonSpec = {
  choice: PublicSeasonChoice;
  rounds: RoundSpec[];
  games: GameSpec[];
};

const gym = (court: string): Where => ({
  venue: 'Central Gym',
  address: '12 Mill Road',
  court,
});
const rec = (court: string): Where => ({
  venue: 'Harbor Rec Center',
  address: '3 Pier Street',
  court,
});

const adult = Object.fromEntries(adultTeams.map((t) => [t.slug, t]));
const youth = Object.fromEntries(youthTeams.map((t) => [t.slug, t]));

const adultFallSpec: SeasonSpec = {
  choice: {
    slug: 'fall-2026',
    name: 'Fall 2026',
    programSlug: 'basketball',
    status: 'active',
    isCurrent: true,
    startsOn: null,
    endsOn: null,
  },
  rounds: [-21, -14, -7, 0, 7, 14].map((daysFromToday) => ({ daysFromToday, label: null })),
  games: [
    {
      round: 0,
      hour: 18,
      home: 'falcons',
      away: 'herons',
      status: 'final',
      score: [52, 47],
      where: gym('Court 1'),
    },
    {
      round: 0,
      hour: 19,
      home: 'badgers',
      away: 'otters',
      status: 'forfeit',
      score: [20, 0],
      where: gym('Court 2'),
    },
    {
      round: 1,
      hour: 18,
      home: 'owls',
      away: 'falcons',
      status: 'final',
      score: [56, 49],
      where: gym('Court 1'),
    },
    {
      round: 1,
      hour: 19,
      home: 'otters',
      away: 'herons',
      status: 'postponed',
      where: gym('Court 2'),
    },
    {
      round: 2,
      hour: 18,
      home: 'herons',
      away: 'owls',
      status: 'final',
      score: [44, 58],
      where: gym('Court 1'),
    },
    {
      round: 2,
      hour: 19,
      home: 'falcons',
      away: 'badgers',
      status: 'final',
      score: [61, 55],
      where: gym('Court 2'),
    },
    {
      round: 3,
      hour: 10,
      home: 'owls',
      away: 'otters',
      status: 'final',
      score: [63, 41],
      where: gym('Court 1'),
    },
    {
      round: 3,
      hour: 12,
      home: 'falcons',
      away: 'herons',
      status: 'live',
      score: [41, 38],
      where: gym('Court 1'),
    },
    {
      round: 3,
      hour: 20,
      home: 'badgers',
      away: 'owls',
      status: 'scheduled',
      where: gym('Court 2'),
    },
    {
      round: 4,
      hour: 18,
      home: 'herons',
      away: 'badgers',
      status: 'scheduled',
      where: gym('Court 1'),
    },
    {
      round: 4,
      hour: 19,
      home: 'otters',
      away: 'falcons',
      status: 'scheduled',
      where: gym('Court 2'),
    },
    {
      round: 5,
      hour: 18,
      home: 'owls',
      away: 'herons',
      status: 'scheduled',
      where: gym('Court 1'),
    },
    {
      round: 5,
      hour: 19,
      home: 'badgers',
      away: 'otters',
      status: 'scheduled',
      where: gym('Court 2'),
    },
  ],
};

const adultSpringSpec: SeasonSpec = {
  choice: {
    slug: 'spring-2026',
    name: 'Spring 2026',
    programSlug: 'basketball',
    status: 'completed',
    isCurrent: false,
    startsOn: null,
    endsOn: null,
  },
  rounds: [-100, -93].map((daysFromToday) => ({ daysFromToday, label: null })),
  games: [
    {
      round: 0,
      hour: 18,
      home: 'herons',
      away: 'falcons',
      status: 'final',
      score: [58, 50],
      where: gym('Court 1'),
    },
    {
      round: 1,
      hour: 18,
      home: 'falcons',
      away: 'badgers',
      status: 'final',
      score: [47, 51],
      where: gym('Court 1'),
    },
  ],
};

const youthWinterSpec: SeasonSpec = {
  choice: {
    slug: 'winter',
    name: 'Winter',
    programSlug: 'basketball',
    status: 'active',
    isCurrent: true,
    startsOn: null,
    endsOn: null,
  },
  rounds: [
    { daysFromToday: -14, label: 'Opening day' },
    { daysFromToday: -7, label: 'Week 2, Pizza night' },
    { daysFromToday: 0, label: 'Week 3' },
    { daysFromToday: 7, label: 'Week 4' },
  ],
  games: [
    {
      round: 0,
      hour: 10,
      home: 'comets',
      away: 'rockets',
      status: 'final',
      score: [31, 28],
      where: rec('Main court'),
    },
    {
      round: 1,
      hour: 10,
      home: 'meteors',
      away: 'comets',
      status: 'final',
      score: [22, 30],
      where: rec('Main court'),
    },
    {
      round: 2,
      hour: 10,
      home: 'rockets',
      away: 'meteors',
      status: 'scheduled',
      where: rec('Main court'),
    },
    {
      round: 3,
      hour: 10,
      home: 'comets',
      away: 'meteors',
      status: 'scheduled',
      where: rec('Main court'),
    },
    {
      round: null,
      hour: null,
      home: 'rockets',
      away: 'comets',
      status: 'scheduled',
      where: rec('Main court'),
    },
  ],
};

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function wallClockIn(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    })
      .formatToParts(instant)
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  return Date.UTC(
    parts['year'] ?? 0,
    (parts['month'] ?? 1) - 1,
    parts['day'],
    parts['hour'],
    parts['minute'],
  );
}

/** The moment it is `hour` o'clock on `day` in the zone. */
function instantAt(day: string, hour: number, timeZone: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const wanted = Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1, hour, 0);
  let guess = new Date(wanted);
  for (let i = 0; i < 2; i += 1) {
    guess = new Date(guess.getTime() + (wanted - wallClockIn(guess, timeZone)));
  }
  return guess;
}

type League = {
  seasonId: string;
  spec: SeasonSpec;
  teams: Record<string, PublicGameTeam & { id: string }>;
};

function build(
  spec: SeasonSpec,
  teams: Record<string, PublicGameTeam>,
  today: string,
  timeZone: string,
): PublicSchedule {
  const roundId = (i: number) =>
    `01900000-0000-7000-8000-${(0xb1000000 + i).toString(16).padStart(12, '0')}`;
  const dateOf = (i: number) => addDays(today, spec.rounds[i]?.daysFromToday ?? 0);
  const games = spec.games.map((g, index): PublicGame & { roundIndex: number | null } => {
    const day = g.round === null ? null : dateOf(g.round);
    const home = teams[g.home];
    const away = teams[g.away];
    if (home === undefined || away === undefined)
      throw new Error('stand-in schedule: unknown team');
    return {
      roundIndex: g.round,
      id: `01900000-0000-7000-8000-${(0xb2000000 + index + spec.games.length * 1000).toString(16).padStart(12, '0')}`,
      number: index + 1,
      startsAt:
        day === null || g.hour === null ? null : instantAt(day, g.hour, timeZone).toISOString(),
      localDate: day,
      status: g.status,
      homeTeam: home,
      awayTeam: away,
      homeScore: g.score?.[0] ?? null,
      awayScore: g.score?.[1] ?? null,
      divisionName: null,
      venue: { name: g.where.venue, address: g.where.address, mapLink: null },
      courtName: g.where.court,
    };
  });
  const strip = ({ roundIndex: _ignored, ...game }: PublicGame & { roundIndex: number | null }) =>
    game;
  return {
    season: spec.choice,
    rounds: placeRounds(
      spec.rounds.map((r, i) => ({
        id: roundId(i),
        number: i + 1,
        label: r.label,
        date: dateOf(i),
        games: games.filter((g) => g.roundIndex === i).map(strip),
      })),
      today,
    ),
    unplacedGames: games.filter((g) => g.roundIndex === null).map(strip),
  };
}

const todayIn = (now: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

/**
 * The made-up schedules for two leagues, given their ids: an adult league with six
 * rounds and a youth league with four. Any other league has no seasons. `now` is the
 * clock the leagues' "today" is read from.
 */
export function standInPublicSchedule(
  ids: { readonly adultLeagueId: string; readonly youthLeagueId: string },
  now: () => Date = () => new Date(),
): PublicSchedulePorts {
  const zones = {
    [ids.adultLeagueId]: 'America/Chicago',
    [ids.youthLeagueId]: 'America/Los_Angeles',
  };
  const zoneOf = (leagueId: string) => zones[leagueId] ?? 'UTC';
  const find = (leagueId: string, seasonId: string): League | undefined => {
    const all: League[] =
      leagueId === ids.adultLeagueId
        ? [
            { seasonId: standInSeasonIds.adultFall, spec: adultFallSpec, teams: adult },
            { seasonId: standInSeasonIds.adultSpring, spec: adultSpringSpec, teams: adult },
          ]
        : leagueId === ids.youthLeagueId
          ? [{ seasonId: standInSeasonIds.youthWinter, spec: youthWinterSpec, teams: youth }]
          : [];
    return all.find((l) => l.seasonId === seasonId);
  };
  return {
    clockOf: async (leagueId): Promise<LeagueClock> => ({
      today: todayIn(now(), zoneOf(leagueId)),
      timeZone: zoneOf(leagueId),
    }),
    scheduleOf: async (leagueId, seasonId, today) => {
      const found = find(leagueId, seasonId);
      return found === undefined
        ? undefined
        : build(found.spec, found.teams, today, zoneOf(leagueId));
    },
  };
}
