// The first test's walk (step 2.194), played through core's own commands on the made-up
// world and read by the pages' own builders, so a change that moves one of its numbers is
// seen before a browser is opened. It is the walk of docs/operations/first-test.md and of
// tests/browser/first-test-walk-test.mjs, tap for tap: the empty league Still Waters
// (step 2.192), three teams (the Owls play no game), five made-up players each for the
// Ravens and the Wolves, one round today with two games and no place, published. Game 1,
// Wolves at Ravens, scored on the tablet: baskets, a foul, one team turnover, a wrong
// basket taken back with Undo, the clock set wrongly and right again, ended from More in
// the middle of the second half. Game 2, Ravens at Wolves, its final score typed: 50 to 45
// for the Wolves. League settings' minimum games for the leaders is set to 1. The numbers
// are the numbers audit's section 1 (docs/build/audits/numbers.md), with the Ravens' 3
// scoring the second half's first basket where the audit's 6 came on for them: the walk
// plays five a side and makes no change.
import {
  addDraftGame,
  addDraftRound,
  addToRoster,
  applyTrackerCommands,
  createPerson,
  createTeam,
  defaultNamePolicy,
  getScheduleDraft,
  openScoringSession,
  publicViewer,
  publishSchedule,
  readGamePage,
  readStandings,
  recordFinalScore,
  setSetting,
  type CommandContext,
} from '@srleagues/core';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { standInPeople, standInSeedCast } from '../../server/stand-in-cast.ts';
import { standInGames } from '../../server/stand-in-games.ts';
import { startingNamePolicy } from '../../server/name-policy-of.ts';
import { standInPublicStats } from '../../server/stand-in-public-stats.ts';
import { dayIn } from '../../server/stand-in-world-clock.ts';
import { worldGameSnapshot } from '../../server/stand-in-world-reads.ts';
import { adultTimeZone, standInSeasonIds } from '../../server/stand-in-world-seed.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
import { buildBoxScores, buildPlays, gameWords } from '../live-game/build-game.ts';
import { buildStandingsViews } from './build-standings.ts';
import { loadStatsPage } from './build-stats.ts';

const leagueId = standInSeedCast.emptyLeague.id;
const seasonId = standInSeasonIds.empty;
const as: CommandContext = {
  leagueId,
  accountId: standInPeople.owner.accountId,
  requestId: 'first-test-walk',
};

const ok = <T>(
  what: string,
  result: { ok: true; value: T } | { ok: false; error: { code: string } },
): T => {
  if (!result.ok) throw new Error(`${what}: ${result.error.code}`);
  return result.value;
};

/** The walk's made-up players: first names, the team's name as the last, and a number. */
const firstNames = ['Ann', 'Ben', 'Cal', 'Dee', 'Eli'] as const;

async function walk() {
  const world = testWorld();
  const { deps } = world;
  const today = dayIn(world.now(), adultTimeZone);

  // Step 2 of first-test.md: three teams, five players each for two of them.
  const team = new Map<string, string>();
  for (const name of ['Ravens', 'Wolves', 'Owls']) {
    // The short name the Teams screen makes from the name.
    const shortName = name.toLowerCase();
    team.set(
      name,
      ok(`team ${name}`, await createTeam(as, { seasonId, name, shortName }, deps)).teamId,
    );
  }
  const player = new Map<string, string>();
  for (const [name, from] of [
    ['Ravens', 1],
    ['Wolves', 11],
  ] as const) {
    for (const [n, first] of firstNames.entries()) {
      const person = ok(
        'person',
        await createPerson(as, { firstName: first, lastName: name, isMinor: false }, deps),
      );
      ok(
        'roster',
        await addToRoster(
          as,
          {
            teamId: team.get(name) ?? '',
            personId: person.personId,
            jerseyNumber: String(from + n),
          },
          deps,
        ),
      );
      player.set(`${name} ${from + n}`, person.personId);
    }
  }
  const id = (who: string) => player.get(who) ?? '';

  // Step 3: a round today and two games with no place; step 4: publish.
  const games = { live: randomUUID(), typed: randomUUID() };
  const basis = async () => {
    const draft = ok('draft', await getScheduleDraft(as, { seasonId }, deps));
    return {
      seasonId,
      basedOnRevision: draft.latestRevision,
      draftId: draft.draft?.id ?? null,
      version: draft.draft?.version ?? null,
    };
  };
  const roundId = randomUUID();
  ok(
    'round',
    await addDraftRound(as, { ...(await basis()), roundId, label: 'Week 1', date: today }, deps),
  );
  for (const [gameId, home, away, time] of [
    [games.live, 'Ravens', 'Wolves', '10:00'],
    [games.typed, 'Wolves', 'Ravens', '11:00'],
  ] as const) {
    ok(
      `game ${home}`,
      await addDraftGame(
        as,
        {
          ...(await basis()),
          gameId,
          homeTeamId: team.get(home) ?? '',
          awayTeamId: team.get(away) ?? '',
          roundId,
          date: today,
          time,
          venueId: null,
          court: null,
        },
        deps,
      ),
    );
  }
  const published = await basis();
  ok(
    'publish',
    await publishSchedule(
      as,
      { ...published, draftId: published.draftId ?? '', version: published.version ?? 0 },
      deps,
    ),
  );

  // Steps 6 to 13: game 1 on the tablet, as the screen sends it.
  const ports = standInGames(world, {
    people: {},
    namesShownOf: async () => ({ audience: 'adult', policy: defaultNamePolicy }),
  });
  const session = ok(
    'session',
    await openScoringSession(as, { gameId: games.live, deviceId: 'walk-tablet' }, ports.deps),
  );
  if (session.status !== 'held-by-you') throw new Error(session.status);
  const tipOff = world.now().getTime() - 50 * 60_000;
  const score = (side: 'home' | 'away', who: string, points: 1 | 2 | 3) => ({
    type: 'score',
    side,
    playerId: id(who),
    points,
  });
  const five = (name: string, from: number) =>
    [0, 1, 2, 3, 4].map((n) => id(`${name} ${from + n}`));
  const taps: readonly (readonly [number, unknown])[] = [
    [-30, { type: 'lineup', side: 'home', playerIds: five('Ravens', 1) }],
    [-29, { type: 'lineup', side: 'away', playerIds: five('Wolves', 11) }],
    [0, { type: 'start' }],
    [60, score('home', 'Ravens 1', 2)],
    [90, score('away', 'Wolves 11', 3)],
    [120, { type: 'foul', side: 'home', playerId: id('Ravens 2') }],
    [150, score('away', 'Wolves 12', 1)],
    [170, { type: 'team-turnover', side: 'away' }],
    [240, score('home', 'Ravens 1', 3)],
    [245, { type: 'undo' }],
    [250, score('home', 'Ravens 4', 2)],
    [300, score('away', 'Wolves 13', 2)],
    // The clock paused at 14:50, set to 12:00 by mistake, and set right again.
    [310, { type: 'pause' }],
    [320, { type: 'set-clock', ms: 12 * 60_000 }],
    [330, { type: 'set-clock', ms: (14 * 60 + 50) * 1000 }],
    [340, { type: 'period', period: 2 }],
    [350, { type: 'start' }],
    [410, score('home', 'Ravens 3', 2)],
    [420, { type: 'foul', side: 'away', playerId: id('Wolves 11') }],
    [500, score('home', 'Ravens 5', 1)],
    // In the middle of the second half, after the question: End game.
    [900, { type: 'end' }],
  ];
  ok(
    'taps',
    await applyTrackerCommands(
      as,
      {
        gameId: games.live,
        protocolVersion: 1,
        sessionId: session.sessionId,
        commands: taps.map(([second, input]) => ({
          commandId: randomUUID(),
          at: tipOff + second * 1000,
          input,
        })),
      },
      ports.deps,
    ),
  );

  // Step 14: game 2's final score, typed.
  ok(
    'typed',
    await recordFinalScore(
      as,
      {
        gameId: games.typed,
        version: await deps.transaction(
          as,
          async (tx) => (await tx.games.find(games.typed))?.version ?? 0,
        ),
        homeScore: 50,
        awayScore: 45,
      },
      deps,
    ),
  );
  // Step 15: League settings' minimum games for the leaders, 1.
  ok(
    'minimum',
    await setSetting(
      as,
      { level: 'league', key: 'statistics.minimumGamesToRank', value: 1, version: null },
      deps,
    ),
  );

  // Steps 16 to 18, as a visitor reads them.
  const viewing = {
    leagueId,
    viewer: publicViewer(leagueId),
    audience: 'adult' as const,
    policy: defaultNamePolicy,
  };
  const snapshot = worldGameSnapshot(() => world.read(leagueId), world.now);
  const live = ok('game 1', await readGamePage(snapshot, { gameId: games.live }, viewing));
  const typed = ok('game 2', await readGamePage(snapshot, { gameId: games.typed }, viewing));
  const stats = standInPublicStats(world, startingNamePolicy);
  const standings = ok('standings', await readStandings(stats.readStoreOf(leagueId), { seasonId }));
  const statsPage = await loadStatsPage(
    stats.readStoreOf(leagueId),
    await stats.settingsOf(leagueId),
    { leagueId, seasonId, by: 'total' },
  );
  if ('code' in statsPage) throw new Error(statsPage.code);
  return { live, typed, standings: buildStandingsViews(standings), statsPage };
}

describe("the first test's walk, through core's commands (step 2.194)", async () => {
  const { live, typed, standings, statsPage } = await walk();

  it('game 1 is final, Ravens 7, Wolves 6; the undone basket is not in the play-by-play', () => {
    expect(live.game.status).toBe('final');
    expect([live.scoreboard.home.score, live.scoreboard.away.score]).toEqual([7, 6]);
    const rows = buildPlays(live, gameWords()).flatMap((period) => period.rows);
    const said = rows.map((row) => row.text).join(' | ');
    // Seven baskets (the Ravens' four, the Wolves' three), never the 3 taken back.
    expect(rows.filter((row) => /Ann Ravens/.test(row.text) && /3/.test(row.text))).toEqual([]);
    expect(said).toMatch(/Ann Ravens/);
  });

  it("game 1's box scores: PTS, 3PM, FTM and PF, each player's and each team's Total", () => {
    const built = buildBoxScores(live);
    if (built.kind !== 'tables') throw new Error(built.kind);
    const of = (name: string) => {
      const table = built.tables.find((x) => x.teamName === name);
      if (table === undefined) throw new Error(`no ${name}`);
      return {
        columns: table.columns.map((c) => c.key),
        players: (table.players ?? []).map((p) => [
          p.name,
          p.cells['points'],
          p.cells['fg3'],
          p.cells['fg1'],
          p.cells['fouls'],
        ]),
        totals: [
          table.totals['points'],
          table.totals['fg3'],
          table.totals['fg1'],
          table.totals['fouls'],
        ],
        notes: table.notes,
      };
    };
    expect(of('Ravens')).toEqual({
      columns: ['points', 'fg3', 'fg1', 'fouls'],
      players: [
        ['Ann Ravens', 2, 0, 0, 0],
        ['Ben Ravens', 0, 0, 0, 1],
        ['Cal Ravens', 2, 0, 0, 0],
        ['Dee Ravens', 2, 0, 0, 0],
        ['Eli Ravens', 1, 0, 1, 0],
      ],
      totals: [7, 0, 1, 1],
      notes: [],
    });
    expect(of('Wolves')).toEqual({
      columns: ['points', 'fg3', 'fg1', 'fouls'],
      players: [
        ['Ann Wolves', 3, 1, 0, 1],
        ['Ben Wolves', 1, 0, 1, 0],
        ['Cal Wolves', 2, 0, 0, 0],
        ['Dee Wolves', 0, 0, 0, 0],
        ['Eli Wolves', 0, 0, 0, 0],
      ],
      totals: [6, 1, 1, 1],
      // The team turnover is counted (the Total keeps it) but the standard set the default
      // rules keep has no TO column, so no page shows it and no sentence explains it.
      notes: [],
    });
    expect(built.tables.find((x) => x.teamName === 'Wolves')?.totals['turnovers']).toBe(1);
  });

  it('game 2 is final, Wolves 50, Ravens 45, with no statistics', () => {
    expect(typed.game.status).toBe('final');
    expect([typed.scoreboard.home.score, typed.scoreboard.away.score]).toEqual([50, 45]);
    // The page says "No statistics were recorded for this game." (game.noStats).
    expect(buildBoxScores(typed).kind).toBe('no-stats');
  });

  it('the standings: Wolves first on point difference, the note beside both, the Owls with no games', () => {
    expect(standings).toHaveLength(1);
    const [table] = standings;
    const row = (n: number) => {
      const r = table?.rows[n];
      const c = r?.cells ?? {};
      return [
        r?.team,
        c['played'],
        c['wins'],
        c['losses'],
        c['winPercentage'],
        c['pointsFor'],
        c['pointsAgainst'],
        c['pointDifference'],
        c['streak'],
        r?.notes,
      ];
    };
    expect([row(0), row(1), row(2)]).toEqual([
      ['Wolves', 2, 1, 1, '.500', 56, 52, '+4', 'W1', ['level-1']],
      ['Ravens', 2, 1, 1, '.500', 52, 56, '-4', 'L1', ['level-1']],
      ['Owls', 0, 0, 0, '.000', 0, 0, '0', '', []],
    ]);
    expect(table?.footnotes).toEqual([
      {
        id: 'level-1',
        text: 'Wolves and Ravens are level on win percentage (.500). Point difference puts Wolves ahead: +4 against -4.',
      },
    ]);
  });

  it('the statistics page: its sentence, and the leaders from one game', () => {
    expect(statsPage.minimumGames).toBe(1);
    expect(statsPage.tableNotes).toEqual([
      'Statistics count the games that were scored live or entered as a box score. A game with only a final score counts in the standings, not here.',
    ]);
    expect(
      statsPage.leaders.map((board) => [
        board.title,
        board.first?.name,
        board.first?.value,
        board.first?.tied,
      ]),
    ).toEqual([
      ['Points', 'Ann Wolves', '3', false],
      ['3-pointers made', 'Ann Wolves', '1', false],
      // Eli Ravens and Ben Wolves made one each: first place is shared, no one card.
      ['Free throws made', 'Eli Ravens', '1', true],
    ]);
    // The lists under the cards (step 2.199). Nobody is listed for a statistic they have
    // none of: the founder saw "2. Ann Ravens 0" under the 3-pointers and the free throws.
    // Points: four players level second on 2 are all shown, and the two on 1 behind them
    // are past the five places. Players level in a place are in no order a parent reads,
    // so each list is compared sorted.
    const lists = statsPage.leaders.map((board) => [
      board.title,
      board.rows
        .map((row) => `${String(row.cells['player'])} ${String(row.cells['value'])}`)
        .sort(),
    ]);
    expect(lists).toEqual([
      [
        'Points',
        [
          '1. Ann Wolves 3',
          '2. Ann Ravens 2',
          '2. Cal Ravens 2',
          '2. Cal Wolves 2',
          '2. Dee Ravens 2',
        ],
      ],
      ['3-pointers made', ['1. Ann Wolves 1']],
      ['Free throws made', ['1. Ben Wolves 1', '1. Eli Ravens 1']],
    ]);
    for (const board of statsPage.leaders) {
      for (const row of board.rows) expect(row.cells['value']).not.toBe('0');
    }
    expect(
      statsPage.teamRows.map((r) => [r.cells['team'], r.cells['games'], r.cells['points']]),
    ).toEqual([
      ['Owls', null, null],
      ['Ravens', 1, '7'],
      ['Wolves', 1, '6'],
    ]);
  });
});
