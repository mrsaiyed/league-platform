// The made-up world agrees with the database (step 2.152, the review's M1): the same
// season is run on both sides, by the product's own commands, and every public read is
// compared. One side is the one world (stand-in-world.ts); the other is the local
// database in memory (PGlite, every migration, through packages/database's own stores).
// Teams and players are added, games scheduled and published, a final score, a box score,
// a forfeit, a postponement and a cancellation recorded, a final score reopened and
// corrected, and a tracked game played and ended. Then the standings, the statistics, the
// published schedule, two game pages and a team's roster must read the same on both. Ids
// the stores make (teams, people, venues) differ between the two, so each is read as its
// name; ids the commands are given (games, sessions) are the same. Where they differ,
// the world is wrong: the database is the product.
//
// What it reaches of the world's copies of the database's queries (the review's list):
// games: find, setResult, addCorrection, listDecided, listDecidedLines, listLines,
// replaceLines, listRoster, hasPlays, findSeason, leagueSettingRows; scoring sessions:
// lockGame, findForGame, start; live games: findState, takenCommands, addEvents,
// saveState, players, lines, saveLines; teams: create, find, findDivision,
// seasonProgramId, leagueSettingRows, findPerson, addRosterEntry; people: create;
// scheduling: findSeason, latestRevision, findDraft, insertDraft, updateDraft,
// deleteDraft, loadSchedule, seasonRules, gamesById, countPeopleOnTeams,
// insertPublishedGames, insertRevision, teamsOfSeason, findVenue, createVenue,
// createCourt, insertRounds, gamesInRounds; standings: lockSeason, listTeams, listAdjustments, replaceRows,
// replaceTotals; all eleven standings reads; the public schedule and its games, the
// game page's reads (game, teams, state, lines, people, correction date) and the public
// roster. What it does not: games' markNotStarted, listPostponed, assign, unassign,
// listWindow; sessions' extend and end; live games' wasDecided, findLastEnd, endedAgo,
// findEvent and the scorer's-table players; teams' update, setBinned, findRosterEntry,
// listRoster, updateRosterEntry; people's find, list, update, setBinned, isOnRoster;
// scheduling's updatePublishedGame, binPublishedGames, updateRound, listVenues and the
// venue and court changes; every imports store method; standings adjustments; the
// settings rows; the public seasons, a game's schedule facts, the start page and a
// member's teams. Those are covered by the feature tests on the world alone.
import {
  addDraftGame,
  addDraftRound,
  addToRoster,
  applyTrackerCommands,
  cancelGame,
  createCourt,
  createDivision,
  createPerson,
  createSeason,
  createTeam,
  createVenue,
  eventHandlers,
  getScheduleDraft,
  openScoringSession,
  postponeGame,
  publicViewer,
  publishSchedule,
  readGamePage,
  readStandings,
  readStatisticsTable,
  recordFinalScore,
  recordForfeit,
  removeDraftRound,
  reopenGame,
  setBoxScore,
  systemClock,
  updateSeason,
  type AccessReader,
  type CommandContext,
  type CommandDeps,
  type GamesReadStore,
  type NamePolicy,
  type StandingsReadStore,
} from '@srleagues/core';
import {
  accessStore,
  activityLogStore,
  commandTransaction,
  createDatabase,
  divisionsStore,
  gamesReadStore,
  gamesStore,
  importsStore,
  leaguesStore,
  listPublicRoster,
  listPublicSchedule,
  liveGamesStore,
  madeUpDatabase,
  peopleStore,
  schedulingStore,
  scoringSessionsStore,
  standingsReadStore,
  standingsStore,
  teamsStore,
  withTransaction,
  type DatabaseHandle,
  type LeagueScope,
} from '@srleagues/database';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startingNamePolicy } from './name-policy-of.ts';
import { addDays, dayIn } from './stand-in-world-clock.ts';
import {
  worldGameSnapshot,
  worldPublicRoster,
  worldPublicSchedule,
} from './stand-in-world-reads.ts';
import { worldStandingsRead } from './stand-in-world-standings.ts';
import { emptyLeagueWorld } from './stand-in-world-state.ts';
import { madeUpWorld, type World, type WorldTx } from './stand-in-world.ts';

const zone = 'America/Chicago';
/** The league's today, worked out once, so a midnight in the middle of the test moves nothing. */
const today = dayIn(new Date(), zone);

/** What one side offers the scenario: the commands' deps and the public reads. */
type Side = {
  readonly name: string;
  readonly deps: CommandDeps<WorldTx>;
  readonly as: CommandContext;
  readonly standings: <T>(read: (store: StandingsReadStore) => Promise<T>) => Promise<T>;
  readonly games: <T>(read: (store: GamesReadStore) => Promise<T>) => Promise<T>;
  readonly schedule: (seasonId: string, today: string) => Promise<unknown>;
  readonly roster: (teamId: string) => Promise<unknown>;
  /** Ids the stores made, by what they are: read as names when comparing. */
  readonly names: Map<string, string>;
};

let database: { close: () => Promise<void> } | undefined;
let db: DatabaseHandle | undefined;
let world: World | undefined;
let sides: readonly [Side, Side] | undefined;

beforeAll(async () => {
  const made = await madeUpDatabase();
  database = made;
  db = createDatabase(made.source);
  const handle = db;
  const league = made.leagues.find((l) => l.slug === 'lakeside');
  if (league === undefined) throw new Error('no seed league');
  const owner = league.ownerAccountId;
  const as: CommandContext = { leagueId: league.leagueId, accountId: owner, requestId: 'agree' };

  const databaseDeps: CommandDeps<WorldTx> = {
    transaction: commandTransaction(handle, (scope) => ({
      jobs: { enqueue: async () => {} },
      access: accessStore(scope),
      activity: activityLogStore(scope),
      clock: systemClock,
      games: gamesStore(scope),
      scoringSessions: scoringSessionsStore(scope),
      liveGames: liveGamesStore(scope),
      standings: standingsStore(scope),
      teams: teamsStore(scope),
      people: peopleStore(scope),
      scheduling: schedulingStore(scope),
      imports: importsStore(scope),
      leagues: leaguesStore(scope),
      divisions: divisionsStore(scope),
    })),
    events: eventHandlers,
    log: () => {},
    now: () => performance.now(),
  };
  const read = <T>(work: (scope: LeagueScope) => Promise<T>) =>
    withTransaction(handle, { leagueId: league.leagueId }, work);

  // The season and its divisions: made by command on the database, as data in the world
  // (the world has no season screen yet), with the same ids.
  const season = await createSeason(
    as,
    { slug: 'scenario-2026', name: 'Scenario 2026' },
    databaseDeps,
  );
  if (!season.ok) throw new Error(`season: ${season.error.code}`);
  const seasonId = season.value.seasonId;
  const active = await updateSeason(
    as,
    { seasonId, version: 1, status: 'active', current: true },
    databaseDeps,
  );
  if (!active.ok) throw new Error(`season active: ${active.error.code}`);
  const divisionIds: string[] = [];
  for (const name of ['North', 'South']) {
    const division = await createDivision(as, { seasonId, name }, databaseDeps);
    if (!division.ok) throw new Error(`division: ${division.error.code}`);
    divisionIds.push(division.value.divisionId);
  }
  const programId = await read((scope) => leaguesStore(scope).seasonProgramId(seasonId));

  const access = (): AccessReader => ({
    ownerAccountId: async () => owner,
    leagueStatus: async () => 'live',
    activeGrantsOf: async () => [],
  });
  const empty = emptyLeagueWorld(
    { id: league.leagueId, slug: 'lakeside', name: 'Lakeside Hoops League' },
    { audience: 'adult', timeZone: zone, minimumGames: 0 },
  );
  world = madeUpWorld({
    leagues: [
      {
        ...empty,
        currentSeasonId: seasonId,
        seasons: [
          {
            id: seasonId,
            programId: programId ?? randomUUID(),
            // The seed league's one program, as the database made it.
            programSlug: 'main',
            name: 'Scenario 2026',
            slug: 'scenario-2026',
            startsOn: null,
            endsOn: null,
            status: 'active',
            rules: (await read((scope) => gamesStore(scope).findSeason(seasonId)))?.rules,
            // A season made by createSeason keeps no statistics of its own yet (0003).
            statKeys: [],
          },
        ],
        divisions: divisionIds.map((id, sort) => ({
          id,
          seasonId,
          name: sort === 0 ? 'North' : 'South',
          sort,
          binned: false,
        })),
      },
    ],
    accessOf: access,
    log: () => {},
  });
  const madeUp = world;
  sides = [
    {
      name: 'database',
      deps: databaseDeps,
      as,
      standings: (work) => read((scope) => work(standingsReadStore(scope))),
      games: (work) => read((scope) => work(gamesReadStore(scope))),
      schedule: (id, today) => read((scope) => listPublicSchedule(scope, id, today)),
      roster: (teamId) =>
        read((scope) =>
          listPublicRoster(scope, teamId, {
            viewer: publicViewer(league.leagueId),
            policy: adultPolicy,
          }),
        ),
      names: new Map(),
    },
    {
      name: 'world',
      deps: madeUp.deps,
      as,
      standings: (work) => work(worldStandingsRead(() => madeUp.read(league.leagueId))),
      games: (work) => work(worldGameSnapshot(() => madeUp.read(league.leagueId))),
      schedule: async (id, today) =>
        worldPublicSchedule(await madeUp.read(league.leagueId), id, today),
      roster: async (teamId) =>
        worldPublicRoster(await madeUp.read(league.leagueId), teamId, {
          viewer: publicViewer(league.leagueId),
          policy: adultPolicy,
        }),
      names: new Map(),
    },
  ];
  const seasonOf = seasonId;
  for (const side of sides) await playTheSeason(side, seasonOf, divisionIds);
}, 180_000);

afterAll(async () => {
  await db?.close();
  await database?.close();
});

/** The starting policy for names: an adult league shows full names (R-15). */
const adultPolicy: NamePolicy = await startingNamePolicy('any');

const ok = <T>(
  what: string,
  result: { ok: true; value: T } | { ok: false; error: { code: string } },
): T => {
  if (!result.ok) throw new Error(`${what}: ${result.error.code}`);
  return result.value;
};

/** When the tracked game's first tap was made: a minute before the test began. */
const tapsFrom = Date.now() - 60_000;

/** The game ids the scenario gives its commands: the same on both sides. */
const gameIds = {
  final: randomUUID(),
  box: randomUUID(),
  forfeit: randomUUID(),
  postponed: randomUUID(),
  cancelled: randomUUID(),
  tracked: randomUUID(),
};

/** Runs the whole season on one side, by the product's own commands. */
async function playTheSeason(side: Side, seasonId: string, divisions: readonly string[]) {
  const { as, deps, names } = side;
  const venue = ok(
    'venue',
    await createVenue(as, { name: 'Scenario Hall', address: '1 Test Road' }, deps),
  );
  names.set(venue.venueId, 'venue:Scenario Hall');
  ok('court', await createCourt(as, { venueId: venue.venueId, name: 'Court 1' }, deps));
  const teams = new Map<string, string>();
  for (const [name, division] of [
    ['Kestrels', 0],
    ['Herons', 0],
    ['Otters', 0],
    ['Pines', 1],
    ['Gulls', 1],
    ['Foxes', 1],
  ] as const) {
    const made = ok(
      `team ${name}`,
      await createTeam(
        as,
        { seasonId, name, shortName: name.toLowerCase(), divisionId: divisions[division] },
        deps,
      ),
    );
    teams.set(name, made.teamId);
    names.set(made.teamId, `team:${name}`);
  }
  const team = (name: string) => teams.get(name) ?? '';
  // Five players each for the two teams the tracker plays, a number each.
  const players = new Map<string, string[]>();
  for (const name of ['Kestrels', 'Herons']) {
    const ids: string[] = [];
    for (let n = 1; n <= 5; n += 1) {
      const person = ok(
        'person',
        await createPerson(
          as,
          { firstName: `${name.slice(0, 3)}${n}`, lastName: 'Player', isMinor: false },
          deps,
        ),
      );
      ok(
        'roster',
        await addToRoster(
          as,
          { teamId: team(name), personId: person.personId, jerseyNumber: String(n * 3) },
          deps,
        ),
      );
      ids.push(person.personId);
      names.set(person.personId, `person:${name}${n}`);
    }
    players.set(name, ids);
  }
  const of = (name: string) => players.get(name) ?? [];

  // The schedule: six games, drafted and published.
  const games: readonly (readonly [
    string,
    string,
    string,
    number,
    string,
    'final' | 'box' | 'live',
  ])[] = [
    [gameIds.final, 'Kestrels', 'Herons', -3, '18:00', 'final'],
    [gameIds.box, 'Kestrels', 'Otters', -2, '18:00', 'box'],
    [gameIds.forfeit, 'Pines', 'Gulls', -2, '19:00', 'final'],
    [gameIds.postponed, 'Foxes', 'Pines', 3, '18:00', 'final'],
    [gameIds.cancelled, 'Otters', 'Gulls', 4, '18:00', 'final'],
    [gameIds.tracked, 'Herons', 'Kestrels', 0, '00:00', 'live'],
  ];
  // The season's rounds, made in the draft (step 2.160): two kept, one added and removed.
  const rounds = [
    { roundId: '01900000-0000-7000-8000-0000000b2160', label: 'Week 1', days: -3 },
    { roundId: '01900000-0000-7000-8000-0000000b2161', label: 'Week 2', days: 3 },
    { roundId: '01900000-0000-7000-8000-0000000b2162', label: 'Spare', days: 10 },
  ] as const;
  const basisNow = async () => {
    const draft = ok('draft', await getScheduleDraft(as, { seasonId }, deps));
    return {
      seasonId,
      basedOnRevision: draft.latestRevision,
      draftId: draft.draft?.id ?? null,
      version: draft.draft?.version ?? null,
    };
  };
  for (const r of rounds) {
    ok(
      `add round ${r.label}`,
      await addDraftRound(
        as,
        { ...(await basisNow()), roundId: r.roundId, label: r.label, date: addDays(today, r.days) },
        deps,
      ),
    );
  }
  ok(
    'remove the spare round',
    await removeDraftRound(as, { ...(await basisNow()), roundId: rounds[2].roundId }, deps),
  );
  const roundOf = (days: number) =>
    days < 0 ? rounds[0].roundId : days > 0 ? rounds[1].roundId : null;
  for (const [gameId, home, away, days, time, recording] of games) {
    const draft = ok('draft', await getScheduleDraft(as, { seasonId }, deps));
    ok(
      `add ${gameId}`,
      await addDraftGame(
        as,
        {
          seasonId,
          basedOnRevision: draft.latestRevision,
          draftId: draft.draft?.id ?? null,
          version: draft.draft?.version ?? null,
          gameId,
          homeTeamId: team(home),
          awayTeamId: team(away),
          roundId: roundOf(days),
          date: addDays(today, days),
          time,
          venueId: venue.venueId,
          court: 'Court 1',
          recording:
            recording === 'final' ? 'final-score' : recording === 'box' ? 'box-score' : 'live',
        },
        deps,
      ),
    );
  }
  const draft = ok('draft', await getScheduleDraft(as, { seasonId }, deps));
  ok(
    'publish',
    await publishSchedule(
      as,
      {
        seasonId,
        basedOnRevision: draft.latestRevision,
        draftId: draft.draft?.id ?? '',
        version: draft.draft?.version ?? 0,
      },
      deps,
    ),
  );

  const versionOf = async (gameId: string) =>
    deps.transaction(as, async (tx) => (await tx.games.find(gameId))?.version ?? 0);
  // A final score, then reopened and corrected.
  ok(
    'final',
    await recordFinalScore(
      as,
      {
        gameId: gameIds.final,
        version: await versionOf(gameIds.final),
        homeScore: 50,
        awayScore: 52,
      },
      deps,
    ),
  );
  ok(
    'reopen',
    await reopenGame(
      as,
      {
        gameId: gameIds.final,
        version: await versionOf(gameIds.final),
        reason: 'Scores the wrong way round',
      },
      deps,
    ),
  );
  ok(
    'corrected',
    await recordFinalScore(
      as,
      {
        gameId: gameIds.final,
        version: await versionOf(gameIds.final),
        homeScore: 52,
        awayScore: 50,
      },
      deps,
    ),
  );
  // A box score.
  const line = (teamName: string, personId: string, points: number) => ({
    teamId: team(teamName),
    personId,
    played: true,
    secondsPlayed: null,
    stats: { points, rebounds: points % 7, fouls: points % 3 },
  });
  const kestrels = of('Kestrels');
  ok(
    'box score',
    await setBoxScore(
      as,
      {
        gameId: gameIds.box,
        version: await versionOf(gameIds.box),
        homeScore: 41,
        awayScore: 38,
        lines: kestrels.map((id, i) => line('Kestrels', id, [12, 9, 8, 7, 5][i] ?? 0)),
      },
      deps,
    ),
  );
  // A forfeit, a postponement and a cancellation.
  ok(
    'forfeit',
    await recordForfeit(
      as,
      {
        gameId: gameIds.forfeit,
        version: await versionOf(gameIds.forfeit),
        forfeitingTeamId: team('Gulls'),
      },
      deps,
    ),
  );
  ok(
    'postpone',
    await postponeGame(
      as,
      { gameId: gameIds.postponed, version: await versionOf(gameIds.postponed) },
      deps,
    ),
  );
  ok(
    'cancel',
    await cancelGame(
      as,
      { gameId: gameIds.cancelled, version: await versionOf(gameIds.cancelled) },
      deps,
    ),
  );
  // A tracked game, played and ended on the tracker.
  const session = ok(
    'session',
    await openScoringSession(as, { gameId: gameIds.tracked, deviceId: 'agree-tablet' }, deps),
  );
  if (session.status !== 'held-by-you') throw new Error(`session: ${session.status}`);
  const sessionId = session.sessionId;
  let n = 0;
  const tap = (input: unknown) => {
    n += 1;
    // The same moments on both sides, a second apart, all before now.
    return { commandId: randomUUID(), at: tapsFrom + n * 1000, input };
  };
  const herons = of('Herons');
  const batch = await applyTrackerCommands(
    as,
    {
      gameId: gameIds.tracked,
      protocolVersion: 1,
      sessionId,
      commands: [
        tap({ type: 'lineup', side: 'home', playerIds: herons }),
        tap({ type: 'lineup', side: 'away', playerIds: kestrels }),
        tap({ type: 'start' }),
        tap({ type: 'score', side: 'home', playerId: herons[0], points: 2 }),
        tap({ type: 'score', side: 'away', playerId: kestrels[1], points: 3 }),
        tap({ type: 'score', side: 'home', playerId: herons[2], points: 2 }),
        tap({ type: 'end' }),
      ],
    },
    deps,
  );
  ok('tracked game', batch);
}

/**
 * Reads every id as the name it was given, so the two sides can be set side by side. An id
 * the test did not name (a division's, the season's, a correction's) is read as its place
 * among the unnamed ids in order of first appearance, `<made:1>`, `<made:2>`: so the same
 * unnamed id must stand in the same places on both sides, and one swapped for another
 * shows.
 */
function asNames(value: unknown, side: Side): unknown {
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const text = JSON.stringify(value, (key, v: unknown) =>
    // A roster entry's own id, and the moment a game was decided, are the store's own.
    key === 'entryId' || key === 'finalizedAt' ? undefined : v,
  );
  const unnamed = new Map<string, string>();
  return JSON.parse(
    text.replace(uuid, (id) => {
      const named = side.names.get(id);
      if (named !== undefined) return named;
      if ((Object.values(gameIds) as string[]).includes(id)) return id;
      const place = unnamed.get(id) ?? `<made:${unnamed.size + 1}>`;
      unnamed.set(id, place);
      return place;
    }),
  );
}

const both = async <T>(read: (side: Side) => Promise<T>) => {
  if (sides === undefined) throw new Error('no sides');
  const [database, madeUp] = sides;
  return [asNames(await read(database), database), asNames(await read(madeUp), madeUp)] as const;
};

describe('the one world and the database, the same season by the same commands', () => {
  const seasonOfSide = async (side: Side) =>
    side.deps.transaction(side.as, async (tx) => {
      const found = await tx.games.find(gameIds.box);
      return found?.seasonId ?? '';
    });
  const viewing = (side: Side) => ({
    leagueId: side.as.leagueId,
    viewer: publicViewer(side.as.leagueId),
    audience: 'adult' as const,
    policy: adultPolicy,
  });

  it('read the same standings', async () => {
    const [a, b] = await both(async (side) => {
      const seasonId = await seasonOfSide(side);
      return side.standings((store) => readStandings(store, { seasonId }));
    });
    expect(b).toEqual(a);
    // And they are the season's: every decided game counted, the forfeit included.
    expect(JSON.stringify(a)).toContain('team:Kestrels');
  });

  it('read the same statistics', async () => {
    const [a, b] = await both(async (side) => {
      const seasonId = await seasonOfSide(side);
      return side.standings((store) =>
        readStatisticsTable(store, { seasonId, viewing: viewing(side) }),
      );
    });
    expect(b).toEqual(a);
    expect(JSON.stringify(a)).toContain('Kes1 Player');
  });

  it('read the same published schedule', async () => {
    const [a, b] = await both(async (side) => side.schedule(await seasonOfSide(side), today));
    expect(b).toEqual(a);
  });

  it('read the same game pages: the box score, the tracked game, the corrected one', async () => {
    for (const gameId of [
      gameIds.box,
      gameIds.tracked,
      gameIds.final,
      gameIds.forfeit,
      gameIds.postponed,
    ]) {
      const [a, b] = await both((side) =>
        side.games((store) => readGamePage(store, { gameId }, viewing(side))),
      );
      expect(b, gameId).toEqual(a);
    }
  });

  it("read the same team's roster", async () => {
    const [a, b] = await both(async (side) => {
      const kestrels = [...side.names].find(([, name]) => name === 'team:Kestrels')?.[0] ?? '';
      return side.roster(kestrels);
    });
    expect(b).toEqual(a);
  });
});
