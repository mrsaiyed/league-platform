// THE SEED OF THE ONE MADE-UP WORLD. FOR LOCAL WORK AND TESTS ONLY, NEVER FOR PRODUCTION.
//
// Every made-up league's rows to begin with, in one place (T-201): what the stand-in's
// one world (stand-in-world.ts) starts from each time the server starts. Every team,
// person, venue and game here is made up. The leagues are data, never named in code.
//
// The adult league: a current season (Fall 2026) of nine teams in two divisions, its six
// rounds counted from the league's own today, so past, current and coming rounds are
// always there however late it is run: box score games, a forfeit, a postponement, a
// tracked game under way (Hawks v Bears) and a game finished this morning with only its
// final score; an earlier season (Spring 2026) and one still being set up. A team shows
// its players' numbers to its staff only (Owls, Bears), a child plays in the adult league
// (Pia), and a player asked for their name not to be shown. The youth league: one season
// ranked by points, named rounds, a make-up game with no round and no time yet, and its
// members start on their team's page (a setting, as League settings saves it). The draft
// league has the adult league's tracked games, scored by assigned scorekeepers only.
// Standings and player totals are not here: core works them out from these results when
// the world is made (stand-in-world.ts).
import { defaultSeasonRules, SeasonRules } from '@srleagues/contracts';
import { membersStartPage, whoMayScore, type Audience, type TeamRecord } from '@srleagues/core';
import { addDays, dayIn, momentIn } from './stand-in-world-clock.ts';
import {
  emptyLeagueWorld,
  type LeagueWorld,
  type WorldGame,
  type WorldPerson,
  type WorldRosterEntry,
  type WorldSeason,
} from './stand-in-world-state.ts';

/** A made-up id: four hex digits that say what it is, then a number. */
const madeUp = (head: string, n: number) =>
  `01900000-0000-7000-8000-${head}${n.toString(16).padStart(8, '0')}`;
const big = (kind: number, n: number) => madeUp('0000', kind * 0x1000000 + n);

const season = (n: number) => big(0xc1, n);
const division = (n: number) => big(0xd1, n);
const team = (n: number) => big(0xa1, n);
const person = (n: number) => big(0xf1, n);
const venue = (n: number) => big(0xe1, n);
const court = (n: number) => big(0xf2, n);

/** The made-up seasons' ids, which pages and tests name. */
export const standInSeasonIds = {
  adultFall: season(1),
  adultSpring: season(2),
  youthWinter: season(3),
  /** The adult league's season still being set up. */
  adultNext: madeUp('005e', 2),
  /** The draft league's season. */
  draftLeague: madeUp('005e', 1),
} as const;

/** A tracked game's id: game 1 to 6 of the adult league (and the draft league's same games). */
export const standInGameId = (n: number) => madeUp('006a', n);

/** A tracked team's player: team 1 to 4 (Lions, Tigers, Hawks, Bears), player 1 to 6. */
export const standInPlayerId = (teamNumber: number, n: number) =>
  madeUp((0x70 + teamNumber).toString(16).padStart(4, '0'), n);

/** A listed game's id: game `index` of a season's `count` (the ids the pictures script names). */
const listedGameId = (count: number, index: number) => big(0, 0xb2000000 + index + count * 1000);

type TeamSpec = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly color: string | null;
  readonly division: string | null;
  readonly statsVisibility: 'everyone' | 'staff';
};

export const adultTeams: readonly TeamSpec[] = [
  {
    id: team(1),
    name: 'Falcons',
    slug: 'falcons',
    color: '#b3262d',
    division: division(1),
    statsVisibility: 'everyone',
  },
  {
    id: team(2),
    name: 'Herons',
    slug: 'herons',
    color: '#1d6f5f',
    division: division(1),
    statsVisibility: 'everyone',
  },
  {
    id: team(3),
    name: 'Owls',
    slug: 'owls',
    color: '#5b3f9a',
    division: division(1),
    statsVisibility: 'staff',
  },
  {
    id: team(4),
    name: 'Badgers',
    slug: 'badgers',
    color: '#444444',
    division: division(2),
    statsVisibility: 'everyone',
  },
  {
    id: team(5),
    name: 'Otters',
    slug: 'otters',
    color: '#0d6efd',
    division: division(2),
    statsVisibility: 'everyone',
  },
  {
    id: madeUp('007e', 1),
    name: 'Lions',
    slug: 'lions',
    color: '#c8862a',
    division: division(2),
    statsVisibility: 'everyone',
  },
  {
    id: madeUp('007e', 2),
    name: 'Tigers',
    slug: 'tigers',
    color: '#d2562c',
    division: division(2),
    statsVisibility: 'everyone',
  },
  {
    id: madeUp('007e', 3),
    name: 'Hawks',
    slug: 'hawks',
    color: '#2f7fb8',
    division: division(2),
    statsVisibility: 'everyone',
  },
  {
    id: madeUp('007e', 4),
    name: 'Bears',
    slug: 'bears',
    color: '#6a4c93',
    division: division(2),
    statsVisibility: 'staff',
  },
];

export const youthTeams: readonly TeamSpec[] = [
  {
    id: team(11),
    name: 'Comets',
    slug: 'comets',
    color: '#e07b00',
    division: null,
    statsVisibility: 'everyone',
  },
  {
    id: team(12),
    name: 'Rockets',
    slug: 'rockets',
    color: '#2a4fd6',
    division: null,
    statsVisibility: 'everyone',
  },
  {
    id: team(13),
    name: 'Meteors',
    slug: 'meteors',
    color: null,
    division: null,
    statsVisibility: 'everyone',
  },
];

/** A player: first and last name, number, and what else is true of them. */
type PlayerSpec = {
  readonly id: string;
  readonly first: string;
  readonly last: string;
  readonly number: string | null;
  readonly role?: 'player' | 'captain' | 'coach';
  readonly left?: string;
  readonly request?: 'none' | 'initials' | 'removed';
  readonly isMinor?: boolean;
  /** The made-up account this person is: their roster place makes the team theirs. */
  readonly account?: 'member';
};

const tracked = (teamNumber: number, last: string, firsts: readonly string[], minor?: string) =>
  firsts.map(
    (first, i): PlayerSpec => ({
      id: standInPlayerId(teamNumber, i + 1),
      first,
      last,
      number: String(i * 2 + 3),
      ...(first === minor ? { isMinor: true } : {}),
    }),
  );

/** Each team's roster, by slug, in roster order. */
const adultRosters: Readonly<Record<string, readonly PlayerSpec[]>> = {
  falcons: [
    { id: person(1), first: 'Dana', last: 'Whitfield', number: '4', role: 'captain' },
    { id: person(2), first: 'Marcus', last: 'Oyelaran', number: '11' },
    { id: person(9), first: 'Lee', last: 'Fontaine', number: '23', request: 'removed' },
    { id: person(10), first: 'Pat', last: 'Gorski', number: '8', left: '2026-10-02' },
    { id: person(11), first: 'Rosa', last: 'Delgado', number: null, role: 'coach' },
  ],
  herons: [
    { id: person(3), first: 'Priya', last: 'Raman', number: '7', role: 'captain' },
    { id: person(4), first: 'Theo', last: 'Lindqvist', number: '12' },
    { id: person(15), first: 'Mina', last: 'Sato', number: '22' },
    {
      id: person(12),
      first: 'Amal',
      last: 'Nasser',
      number: null,
      role: 'coach',
      account: 'member',
    },
  ],
  owls: [
    { id: person(5), first: 'Jordan', last: 'Castellanos', number: '3', role: 'captain' },
    { id: person(6), first: 'Imani', last: 'Brooks', number: '15' },
  ],
  badgers: [
    { id: person(7), first: 'Wen', last: 'Zhao', number: '9', role: 'captain' },
    { id: person(13), first: 'Kofi', last: 'Mensah', number: '21' },
  ],
  otters: [
    { id: person(8), first: 'Ravi', last: 'Patel', number: '5', role: 'captain' },
    { id: person(14), first: 'Gita', last: 'Shah', number: '14' },
  ],
  lions: tracked(1, 'Lionel', ['Ada', 'Ben', 'Cy', 'Dee', 'Eli', 'Fay']),
  tigers: tracked(2, 'Tigerton', ['Gus', 'Hal', 'Ivy', 'Jo', 'Kit', 'Lu']),
  // Pia is a child playing in the adult league, so the league's names setting shows on
  // its game pages and live messages too (R-14, R-24).
  hawks: tracked(3, 'Hawkins', ['Max', 'Ned', 'Oz', 'Pia', 'Quin', 'Ray'], 'Pia'),
  bears: tracked(4, 'Bearsley', ['Sol', 'Tam', 'Uma', 'Vic', 'Wes', 'Xan']),
};

const youthRosters: Readonly<Record<string, readonly PlayerSpec[]>> = {
  comets: [
    { id: person(21), first: 'Sam', last: 'Rivera', number: '2' },
    { id: person(24), first: 'Maya', last: 'Cho', number: '10' },
    { id: person(25), first: 'Dev', last: 'Anand', number: null, role: 'coach' },
  ],
  rockets: [
    { id: person(22), first: 'Noor', last: 'Haddad', number: '6', role: 'captain' },
    { id: person(26), first: 'Jay', last: 'Whitaker', number: '13' },
    { id: person(27), first: 'Tess', last: 'Moreno', number: '1', left: '2026-11-01' },
    {
      id: person(28),
      first: 'Lena',
      last: 'Ortiz',
      number: null,
      role: 'coach',
      // The team's coach, a grown-up: the made-up member's own roster place (U-5).
      isMinor: false,
      account: 'member',
    },
  ],
  meteors: [{ id: person(23), first: 'Eli', last: 'Okafor', number: '17' }],
};

/** People of the adult league on no team yet, for the admin to put on one. */
const adultFreeAgents: readonly PlayerSpec[] = [
  { id: person(41), first: 'Leo', last: 'Fischer', number: null },
  { id: person(42), first: 'Aiko', last: 'Tanaka', number: null },
  { id: person(43), first: 'Omar', last: 'Said', number: null },
  { id: person(44), first: 'Tess', last: 'Okafor', number: null },
];

/** One box score line: points, rebounds, fouls. */
type Line = readonly [person: string, points: number, rebounds: number, fouls: number];

type GameSpec = {
  readonly id: string;
  /** The round's index, or null for a game in no round. */
  readonly round: number | null;
  /** Days from the league's today, where the game's day is not its round's. */
  readonly day?: number;
  /** HH:MM in the league's time zone; null for no time yet. */
  readonly time: string | null;
  readonly home: string;
  readonly away: string;
  readonly status: string;
  readonly score?: readonly [number, number];
  readonly capture: 'final' | 'box' | 'live';
  readonly venue: string | null;
  readonly court: string | null;
  readonly number: number | null;
  readonly lines?: readonly Line[];
};

type SeasonSpec = {
  readonly season: Omit<WorldSeason, 'rules' | 'statKeys'> & { readonly rules: unknown };
  readonly teams: readonly TeamSpec[];
  readonly rosters: Readonly<Record<string, readonly PlayerSpec[]>>;
  readonly divisions: readonly { readonly id: string; readonly name: string }[];
  readonly rounds: readonly {
    readonly id: string;
    readonly days: number;
    readonly label: string | null;
  }[];
  readonly games: readonly GameSpec[];
};

const statKeys = ['points', 'rebounds', 'fouls'] as const;
const win = SeasonRules.parse(defaultSeasonRules());
const byPoints = SeasonRules.parse({
  ...defaultSeasonRules(),
  standings: { ...win.standings, rankBy: 'points', columns: [...win.standings.columns, 'points'] },
});

const gym = venue(1);
const rec = venue(2);
const p = (n: number) => person(n);
const [falcons, herons, owls, badgers, otters, lions, tigers, hawks, bears] = adultTeams.map(
  (t) => t.id,
) as [string, string, string, string, string, string, string, string, string];
const [comets, rockets, meteors] = youthTeams.map((t) => t.id) as [string, string, string];
const tp = standInPlayerId;

const adultFall = (programId: string): SeasonSpec => ({
  season: {
    id: standInSeasonIds.adultFall,
    programId,
    programSlug: 'basketball',
    name: 'Fall 2026',
    slug: 'fall-2026',
    startsOn: null,
    endsOn: null,
    status: 'active',
    rules: win,
  },
  teams: adultTeams,
  rosters: adultRosters,
  divisions: [
    { id: division(1), name: 'East' },
    { id: division(2), name: 'West' },
  ],
  rounds: [-21, -14, -7, 0, 7, 14].map((days, i) => ({ id: big(0xb2, i + 1), days, label: null })),
  games: [
    ...(
      [
        {
          round: 0,
          time: '18:00',
          home: falcons,
          away: herons,
          status: 'final',
          score: [52, 47],
          capture: 'box',
          court: 1,
          lines: [
            [p(1), 24, 6, 2],
            [p(2), 18, 9, 3],
            [p(9), 10, 2, 1],
            [p(3), 27, 5, 2],
            [p(4), 20, 2, 0],
          ],
        },
        {
          round: 0,
          time: '19:00',
          home: badgers,
          away: otters,
          status: 'forfeit',
          score: [20, 0],
          capture: 'final',
          court: 2,
        },
        {
          round: 1,
          time: '18:00',
          home: owls,
          away: falcons,
          status: 'final',
          score: [56, 49],
          capture: 'box',
          court: 1,
          lines: [
            [p(5), 30, 7, 1],
            [p(6), 26, 12, 3],
            [p(1), 21, 5, 3],
            [p(2), 16, 8, 4],
            [p(9), 12, 3, 2],
          ],
        },
        {
          round: 1,
          time: '19:00',
          home: otters,
          away: herons,
          status: 'postponed',
          capture: 'final',
          court: 2,
        },
        {
          round: 2,
          time: '18:00',
          home: herons,
          away: owls,
          status: 'final',
          score: [44, 58],
          capture: 'box',
          court: 1,
          lines: [
            [p(3), 26, 7, 2],
            [p(15), 18, 4, 3],
            [p(5), 32, 6, 2],
            [p(6), 26, 11, 2],
          ],
        },
        {
          round: 2,
          time: '19:00',
          home: falcons,
          away: badgers,
          status: 'final',
          score: [61, 55],
          capture: 'box',
          court: 2,
          lines: [
            [p(1), 28, 7, 1],
            [p(2), 20, 10, 2],
            [p(9), 13, 4, 3],
            [p(7), 31, 9, 2],
            [p(13), 24, 6, 4],
          ],
        },
        {
          round: 3,
          time: '10:00',
          home: owls,
          away: otters,
          status: 'final',
          score: [41, 63],
          capture: 'box',
          court: 1,
          lines: [
            [p(5), 25, 8, 3],
            [p(6), 16, 13, 4],
            [p(8), 35, 6, 2],
            [p(14), 28, 5, 1],
          ],
        },
        {
          round: 3,
          time: '12:00',
          home: falcons,
          away: herons,
          status: 'scheduled',
          capture: 'box',
          court: 1,
        },
        {
          round: 3,
          time: '20:00',
          home: badgers,
          away: owls,
          status: 'scheduled',
          capture: 'box',
          court: 2,
        },
        {
          round: 4,
          time: '18:00',
          home: herons,
          away: badgers,
          status: 'scheduled',
          capture: 'box',
          court: 1,
        },
        {
          round: 4,
          time: '19:00',
          home: otters,
          away: falcons,
          status: 'scheduled',
          capture: 'box',
          court: 2,
        },
        {
          round: 5,
          time: '18:00',
          home: owls,
          away: herons,
          status: 'scheduled',
          capture: 'box',
          court: 1,
        },
        {
          round: 5,
          time: '19:00',
          home: badgers,
          away: otters,
          status: 'scheduled',
          capture: 'box',
          court: 2,
        },
      ] as const
    ).map(
      (g, index): GameSpec => ({
        ...g,
        id: listedGameId(13, index),
        venue: gym,
        court: court(g.court),
        number: index + 1,
      }),
    ),
    // The tracked teams' own past results, scores only, so every West team but two has
    // played: no team is unbeaten, the adjusted Badgers are level with nobody, and a row
    // carries one footnote mark at most, as the divisions' tables are laid out for.
    ...(
      [
        { round: 0, home: tigers, away: hawks, score: [55, 48], court: 1 },
        { round: 1, home: bears, away: badgers, score: [60, 52], court: 1 },
        { round: 1, home: hawks, away: tigers, score: [51, 47], court: 2 },
        { round: 2, home: otters, away: lions, score: [58, 49], court: 1 },
      ] as const
    ).map(
      (g, i): GameSpec => ({
        id: listedGameId(13, 13 + i),
        round: g.round,
        time: '20:00',
        home: g.home,
        away: g.away,
        status: 'final',
        score: g.score,
        capture: 'final',
        venue: gym,
        court: court(g.court),
        number: 19 + i,
      }),
    ),
    // The games the tracker and the games area grew up with, all in this week's round.
    ...(
      [
        {
          n: 1,
          day: 0,
          time: '18:00',
          home: lions,
          away: tigers,
          status: 'scheduled',
          capture: 'final',
          court: 1,
        },
        {
          n: 2,
          day: 0,
          time: '17:00',
          home: hawks,
          away: bears,
          status: 'live',
          capture: 'live',
          court: 2,
        },
        {
          n: 3,
          day: 1,
          time: '19:00',
          home: hawks,
          away: lions,
          status: 'scheduled',
          capture: 'live',
          court: 1,
        },
        {
          n: 4,
          day: 2,
          time: '18:00',
          home: tigers,
          away: bears,
          status: 'scheduled',
          capture: 'final',
          court: 1,
        },
        {
          n: 5,
          day: 0,
          time: '09:00',
          home: bears,
          away: lions,
          status: 'final',
          score: [44, 50],
          capture: 'final',
          court: 1,
        },
      ] as const
    ).map(
      (g): GameSpec => ({
        ...g,
        id: standInGameId(g.n),
        round: 3,
        venue: gym,
        court: court(g.court),
        number: 13 + g.n,
      }),
    ),
  ],
});

const adultSpring = (programId: string): SeasonSpec => {
  const spring = (of: string) => adultTeams.find((t) => t.id === of);
  const teams = [falcons, herons, badgers].flatMap((id, i) => {
    const t = spring(id);
    return t === undefined
      ? []
      : [{ ...t, id: team(31 + i), division: null, statsVisibility: 'everyone' as const }];
  });
  const [sFalcons = '', sHerons = '', sBadgers = ''] = teams.map((t) => t.id);
  return {
    season: {
      id: standInSeasonIds.adultSpring,
      programId,
      programSlug: 'basketball',
      name: 'Spring 2026',
      slug: 'spring-2026',
      startsOn: null,
      endsOn: null,
      status: 'completed',
      rules: win,
    },
    teams,
    rosters: {
      falcons: [{ id: person(1), first: 'Dana', last: 'Whitfield', number: '4', role: 'captain' }],
      herons: [{ id: person(3), first: 'Priya', last: 'Raman', number: '7', role: 'captain' }],
      badgers: [{ id: person(7), first: 'Wen', last: 'Zhao', number: '9', role: 'captain' }],
    },
    divisions: [],
    rounds: [-100, -93].map((days, i) => ({ id: big(0xb3, i + 1), days, label: null })),
    games: [
      {
        id: listedGameId(2, 0),
        round: 0,
        time: '18:00',
        home: sHerons,
        away: sFalcons,
        status: 'final',
        score: [58, 50],
        capture: 'final',
        venue: gym,
        court: court(1),
        number: 1,
      },
      {
        id: listedGameId(2, 1),
        round: 1,
        time: '18:00',
        home: sFalcons,
        away: sBadgers,
        status: 'final',
        score: [47, 51],
        capture: 'final',
        venue: gym,
        court: court(1),
        number: 2,
      },
    ],
  };
};

/** The adult league's next season, still being set up: hidden from the public. */
const adultNext = (programId: string): SeasonSpec => {
  const next = [lions, tigers].flatMap((id, i) => {
    const t = adultTeams.find((x) => x.id === id);
    return t === undefined ? [] : [{ ...t, id: team(41 + i), division: null }];
  });
  return {
    season: {
      id: standInSeasonIds.adultNext,
      programId,
      programSlug: 'basketball',
      name: 'Winter 2027',
      slug: 'winter-2027',
      startsOn: null,
      endsOn: null,
      status: 'draft',
      rules: win,
    },
    teams: next,
    rosters: {},
    divisions: [],
    rounds: [],
    games: [
      {
        id: standInGameId(6),
        round: null,
        time: null,
        home: team(41),
        away: team(42),
        status: 'scheduled',
        capture: 'final',
        venue: null,
        court: null,
        number: null,
      },
    ],
  };
};

const youthWinter = (programId: string): SeasonSpec => ({
  season: {
    id: standInSeasonIds.youthWinter,
    programId,
    programSlug: 'basketball',
    name: 'Winter',
    slug: 'winter',
    startsOn: null,
    endsOn: null,
    status: 'active',
    rules: byPoints,
  },
  teams: youthTeams,
  rosters: youthRosters,
  divisions: [],
  rounds: [
    { id: big(0xb4, 1), days: -14, label: 'Opening day' },
    { id: big(0xb4, 2), days: -7, label: 'Week 2, Pizza night' },
    { id: big(0xb4, 3), days: 0, label: 'Week 3' },
    { id: big(0xb4, 4), days: 7, label: 'Week 4' },
  ],
  games: (
    [
      {
        round: 0,
        time: '10:00',
        home: comets,
        away: rockets,
        status: 'final',
        score: [30, 22],
        capture: 'box',
        lines: [
          [p(21), 16, 6, 1],
          [p(24), 14, 4, 2],
          [p(22), 12, 7, 1],
          [p(26), 10, 3, 2],
        ],
      },
      {
        round: 1,
        time: '10:00',
        home: meteors,
        away: comets,
        status: 'final',
        score: [22, 30],
        capture: 'box',
        lines: [
          [p(23), 22, 4, 1],
          [p(21), 18, 5, 2],
          [p(24), 12, 6, 1],
        ],
      },
      {
        round: 2,
        time: '10:00',
        home: rockets,
        away: meteors,
        status: 'scheduled',
        capture: 'box',
      },
      { round: 3, time: '10:00', home: comets, away: meteors, status: 'scheduled', capture: 'box' },
      { round: null, time: null, home: rockets, away: comets, status: 'scheduled', capture: 'box' },
    ] as const
  ).map(
    (g, index): GameSpec => ({
      ...g,
      id: listedGameId(5, index),
      venue: rec,
      court: court(11),
      number: index + 1,
    }),
  ),
});

/** The draft league's season: the adult league's tracked teams and games, all its own copy. */
const draftLeagueSeason = (programId: string): SeasonSpec => {
  const fall = adultFall(programId);
  const own = [lions, tigers, hawks, bears];
  return {
    season: {
      ...fall.season,
      id: standInSeasonIds.draftLeague,
      name: '2026–27 Season',
      slug: '2026-27',
      status: 'active',
    },
    teams: adultTeams.filter((t) => own.includes(t.id)).map((t) => ({ ...t, division: null })),
    rosters: adultRosters,
    divisions: [],
    rounds: [{ id: big(0xb5, 1), days: 0, label: null }],
    games: [
      // At the draft league's own gym, on its own courts.
      ...fall.games
        .filter((g) => g.id.includes('-8000-006a'))
        .map((g) => ({
          ...g,
          round: 0,
          venue: pines,
          court: g.court === court(1) ? court(21) : court(22),
        })),
      {
        id: standInGameId(6),
        round: null,
        time: null,
        home: lions,
        away: tigers,
        status: 'scheduled',
        capture: 'final',
        venue: null,
        court: null,
        number: null,
      },
    ],
  };
};

/** A made-up league of the cast: its id, short name and own name. */
export type CastLeague = { readonly id: string; readonly slug: string; readonly name: string };

/** The leagues and people the seed needs from the stand-in's cast (stand-in-cast.ts). */
export type SeedCast = {
  /** The adult league, the youth league and the draft league scored by assigned scorekeepers. */
  readonly adultLeague: CastLeague;
  readonly youthLeague: CastLeague;
  readonly draftLeague: CastLeague;
  /** The draft league's one program, which a made-up scheduler holds a grant for. */
  readonly draftProgramId: string;
  /** Every other made-up league: no seasons yet. */
  readonly otherLeagues: readonly CastLeague[];
  /** The account that has a roster place in each league (a made-up member). */
  readonly memberAccountId: string;
  /** Who is given games to score: in the adult league, the first two games to the first and
   * game 4 to the second; in the draft league, the same games the other way round. */
  readonly assignees: readonly [string, string];
  readonly draftAssignees: readonly [string, string];
};

type LeagueFacts = {
  readonly league: CastLeague;
  readonly audience: Audience;
  readonly timeZone: string;
  readonly minimumGames: number;
  readonly programId: string;
  /** The league's own venues, each with its courts. */
  readonly venues: readonly VenueSpec[];
};

type VenueSpec = {
  readonly id: string;
  readonly name: string;
  readonly address: string;
  readonly courts: readonly { readonly id: string; readonly name: string }[];
};

/** Each league's venues are its own (a league never offers another's gym). */
const adultVenues: readonly VenueSpec[] = [
  {
    id: gym,
    name: 'Central Gym',
    address: '12 Mill Road',
    courts: [
      { id: court(1), name: 'Court 1' },
      { id: court(2), name: 'Court 2' },
    ],
  },
  {
    id: venue(3),
    name: 'Riverside Hall',
    address: '40 River Lane',
    courts: [{ id: court(3), name: 'Court A' }],
  },
];
const youthVenues: readonly VenueSpec[] = [
  {
    id: rec,
    name: 'Harbor Rec Center',
    address: '3 Pier Street',
    courts: [{ id: court(11), name: 'Main court' }],
  },
];
const pines = venue(4);
const draftVenues: readonly VenueSpec[] = [
  {
    id: pines,
    name: 'Pine Hollow Gym',
    address: '8 Cedar Way',
    courts: [
      { id: court(21), name: 'Court 1' },
      { id: court(22), name: 'Court 2' },
    ],
  },
];

function leagueOf(
  facts: LeagueFacts,
  seasons: readonly SeasonSpec[],
  current: string,
  memberAccountId: string,
  now: Date,
): LeagueWorld {
  const s = emptyLeagueWorld(facts.league, facts);
  const today = dayIn(now, facts.timeZone);
  s.currentSeasonId = current;
  s.venues = facts.venues.map((v) => ({
    id: v.id,
    name: v.name,
    address: v.address,
    mapLink: null,
    binned: false,
    version: 1,
  }));
  s.courts = facts.venues.flatMap((v) =>
    v.courts.map((c, sort) => ({
      id: c.id,
      venueId: v.id,
      name: c.name,
      sort: sort + 1,
      binned: false,
      version: 1,
    })),
  );
  const people = new Map<string, WorldPerson>();
  const personOf = (spec: PlayerSpec): WorldPerson => ({
    id: spec.id,
    firstName: spec.first,
    lastName: spec.last,
    publicName: null,
    visibility: spec.request ?? 'none',
    binned: false,
    version: 1,
    sensitive: { contactEmail: null, birthDate: null, isMinor: spec.isMinor ?? null },
    accountId: spec.account === 'member' ? memberAccountId : null,
  });
  // The same team across seasons keeps one lineage: here, the teams of one short name.
  const lineages = new Map<string, string>();
  const lineageOf = (slug: string) => {
    const known = lineages.get(slug) ?? big(0xa9, lineages.size + 1);
    lineages.set(slug, known);
    return known;
  };
  let entries = 0;
  for (const spec of seasons) {
    const { rules, ...rest } = spec.season;
    s.seasons.push({ ...rest, rules, statKeys: [...statKeys] });
    spec.divisions.forEach((d, sort) =>
      s.divisions.push({ id: d.id, seasonId: spec.season.id, name: d.name, sort, binned: false }),
    );
    for (const t of spec.teams) {
      const kept: TeamRecord = {
        id: t.id,
        seasonId: spec.season.id,
        divisionId: t.division,
        slug: t.slug,
        name: t.name,
        color: t.color,
        statsVisibility: t.statsVisibility,
        lineageId: lineageOf(t.slug),
        binned: false,
        version: 1,
      };
      s.teams.push(kept);
      (spec.rosters[t.slug] ?? []).forEach((player, sort) => {
        if (!people.has(player.id)) people.set(player.id, personOf(player));
        entries += 1;
        const entry: WorldRosterEntry = {
          id: madeUp('00e0', entries),
          teamId: t.id,
          personId: player.id,
          jerseyNumber: player.number,
          role: player.role ?? 'player',
          joinedOn: null,
          leftOn: player.left ?? null,
          sort,
          version: 1,
          addedAtGameId: null,
          needsReview: false,
        };
        s.roster.push(entry);
      });
    }
    for (const r of spec.rounds) {
      s.rounds.push({
        id: r.id,
        seasonId: spec.season.id,
        number: spec.rounds.indexOf(r) + 1,
        label: r.label,
        date: addDays(today, r.days),
      });
    }
    for (const g of spec.games) {
      const round = g.round === null ? undefined : spec.rounds[g.round];
      const day =
        g.day !== undefined
          ? addDays(today, g.day)
          : round === undefined
            ? null
            : addDays(today, round.days);
      const startsAt =
        day === null || g.time === null ? null : momentIn(day, g.time, facts.timeZone);
      const home = s.teams.find((t) => t.id === g.home);
      const away = s.teams.find((t) => t.id === g.away);
      const decided = g.status === 'final' || g.status === 'forfeit';
      const game: WorldGame = {
        id: g.id,
        seasonId: spec.season.id,
        divisionId: home?.divisionId === away?.divisionId ? (home?.divisionId ?? null) : null,
        homeTeamId: g.home,
        awayTeamId: g.away,
        startsAt,
        status: g.status,
        captureMode: g.capture,
        homeScore: g.score?.[0] ?? null,
        awayScore: g.score?.[1] ?? null,
        format: decided ? rules : null,
        finalizedAt: decided ? startsAt : null,
        binned: false,
        version: decided ? 2 : 1,
        roundId: round?.id ?? null,
        number: g.number,
        localDate: day,
        localTime: g.time,
        venueId: g.venue,
        courtId: g.court,
      };
      s.games.push(game);
      for (const [personId, points, rebounds, fouls] of g.lines ?? []) {
        const entry = s.roster.find(
          (e) => e.personId === personId && (e.teamId === g.home || e.teamId === g.away),
        );
        if (entry === undefined) throw new Error('A made-up line for someone on neither team.');
        s.lines.push({
          gameId: g.id,
          teamId: entry.teamId,
          personId,
          jerseyNumber: entry.jerseyNumber,
          played: true,
          secondsPlayed: null,
          stats: { points, rebounds, fouls },
        });
      }
    }
  }
  s.people = [...people.values()];
  return s;
}

/**
 * Every made-up league's rows, with days counted from `now` in each league's own time
 * zone, so the current round is always this week's.
 */
export function madeUpLeagues(cast: SeedCast, now: Date): LeagueWorld[] {
  const adultProgram = madeUp('009a', 1);
  const adult = leagueOf(
    {
      league: cast.adultLeague,
      audience: 'adult',
      timeZone: 'America/Chicago',
      minimumGames: 3,
      programId: adultProgram,
      venues: adultVenues,
    },
    [adultFall(adultProgram), adultSpring(adultProgram), adultNext(adultProgram)],
    standInSeasonIds.adultFall,
    cast.memberAccountId,
    now,
  );
  for (const spec of adultFreeAgents) {
    adult.people.push({
      id: spec.id,
      firstName: spec.first,
      lastName: spec.last,
      publicName: null,
      visibility: 'none',
      binned: false,
      version: 1,
      sensitive: { contactEmail: null, birthDate: null, isMinor: null },
      accountId: null,
    });
  }
  // The live game has plays from the tracker, recorded before this process started.
  adult.playsBefore = [standInGameId(2)];
  // An adjustment the admin entered, with its reason (S-10).
  adult.adjustments = [
    {
      id: big(0xad, 1),
      seasonId: standInSeasonIds.adultFall,
      teamId: badgers,
      wins: -1,
      losses: 0,
      ties: 0,
      points: 0,
      reason: 'Played an ineligible player in round 3.',
      binned: false,
    },
  ];
  const [first, second] = cast.assignees;
  adult.assignments = [
    { gameId: standInGameId(1), accountId: first },
    { gameId: standInGameId(2), accountId: first },
    { gameId: standInGameId(4), accountId: second },
  ];

  const youthProgram = madeUp('009a', 2);
  const youth = leagueOf(
    {
      league: cast.youthLeague,
      audience: 'youth',
      timeZone: 'America/Los_Angeles',
      minimumGames: 2,
      programId: youthProgram,
      venues: youthVenues,
    },
    [youthWinter(youthProgram)],
    standInSeasonIds.youthWinter,
    cast.memberAccountId,
    now,
  );
  // Members start on their team's page here, as the league's admin chose (U-5).
  youth.settings = [
    {
      place: { level: 'league' },
      key: membersStartPage.key,
      document: { version: membersStartPage.version, value: 'myTeam' },
      version: 1,
    },
  ];

  const draftProgram = cast.draftProgramId;
  const draft = leagueOf(
    {
      league: cast.draftLeague,
      audience: 'youth',
      timeZone: 'America/Chicago',
      minimumGames: 0,
      programId: draftProgram,
      venues: draftVenues,
    },
    [draftLeagueSeason(draftProgram)],
    standInSeasonIds.draftLeague,
    cast.memberAccountId,
    now,
  );
  draft.playsBefore = [standInGameId(2)];
  // It scores assigned games only, and its admin is given the live ones (P7 §5.1).
  draft.settings = [
    {
      place: { level: 'league' },
      key: whoMayScore.key,
      document: { version: whoMayScore.version, value: 'assignedOnly' },
      version: 1,
    },
  ];
  const [draftFirst, draftSecond] = cast.draftAssignees;
  draft.assignments = [
    { gameId: standInGameId(1), accountId: draftFirst },
    { gameId: standInGameId(2), accountId: draftFirst },
    { gameId: standInGameId(4), accountId: draftSecond },
  ];

  const others = cast.otherLeagues.map((league) =>
    emptyLeagueWorld(league, { audience: 'youth', timeZone: 'UTC', minimumGames: 0 }),
  );
  return [adult, youth, draft, ...others];
}
