// What the home page lists (step 2.147), on the made-up stand-in schedule: a game whose
// start has passed with no result is never among the games to come, no coming game is
// left out, and the latest games (decided ones first) follow the height of the standings
// beside them.
import { describe, expect, it } from 'vitest';
import { standInPublicSchedule } from '../../server/stand-in-public-schedule.ts';
import { standInPublicStats } from '../../server/stand-in-public-stats.ts';
import { startingNamePolicy } from '../../server/name-policy-of.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
import { buildHomeGames, buildScheduleView, gameView, type GameView } from './build-schedule.ts';
import { gameLinkText } from './game-link-text.ts';
import { homeLeadersPlace, homeNextGames, homeResults } from './home-lists.ts';
import { gameLinkWords } from './schedule-views.tsx';

const adult = '01900000-0000-7000-8000-000000000001';
const youth = '01900000-0000-7000-8000-000000000002';
const now = () => new Date('2026-11-13T15:00:00Z');
const world = testWorld(undefined, now);
const schedules = standInPublicSchedule(world);
const stats = standInPublicStats(world, startingNamePolicy);
const addressee = { id: adult, slug: 'north', customDomain: null } as never;

async function load() {
  const season = (await stats.seasonsOf(adult))[0];
  if (season === undefined) throw new Error('no season');
  const clock = await schedules.clockOf(adult);
  const schedule = await schedules.scheduleOf(adult, season.id, clock.today);
  if (schedule === undefined) throw new Error('no schedule');
  const base = schedule.rounds.flatMap((r) => r.games).find((g) => g.status === 'scheduled');
  if (base === undefined) throw new Error('no game still to play');
  return { clock, schedule, base };
}

/** 9:30 in the evening of November 13 in the league's zone (Chicago). */
const evening = {
  today: '2026-11-13',
  now: '2026-11-14T03:30:00.000Z',
  timeZone: 'America/Chicago',
};

describe('a game whose start has passed with no result', () => {
  it('is told apart from one still to come, by the league’s own clock', async () => {
    const { schedule, base } = await load();
    const view = (startsAt: string | null, localDate: string | null, status = 'scheduled') =>
      gameView({ ...base, startsAt, localDate, status }, evening, addressee, schedule.season.slug);
    // 7 pm today in Chicago: started two and a half hours ago.
    expect(view('2026-11-14T01:00:00.000Z', '2026-11-13').awaiting).toBe(true);
    // 10 pm tonight: half an hour from now.
    expect(view('2026-11-14T04:00:00.000Z', '2026-11-13').awaiting).toBeUndefined();
    // A day and no time: waiting only once that day is over in the league's zone.
    expect(view(null, '2026-11-12').awaiting).toBe(true);
    expect(view(null, '2026-11-13').awaiting).toBeUndefined();
    // No day at all, and every other state: never.
    expect(view(null, null).awaiting).toBeUndefined();
    for (const status of ['live', 'final', 'forfeit', 'postponed', 'cancelled']) {
      expect(view('2026-11-14T01:00:00.000Z', '2026-11-13', status).awaiting, status).toBe(
        undefined,
      );
    }
  });

  it('says so in its link, for a screen reader', async () => {
    const { schedule, base } = await load();
    const late = gameView(
      { ...base, startsAt: '2026-11-14T01:00:00.000Z', localDate: '2026-11-13' },
      evening,
      addressee,
      schedule.season.slug,
    );
    const words = gameLinkWords();
    expect(gameLinkText(late, words)).toBe(
      `${late.away.name} against ${late.home.name}, ${late.whenText}, awaiting the result`,
    );
    expect(gameLinkText({ ...late, awaiting: false }, words)).toBe(
      `${late.away.name} against ${late.home.name}, ${late.whenText}`,
    );
  });

  it('is listed for the home page apart from the games to come, latest first, two at most', async () => {
    const { schedule, base } = await load();
    const game = (id: string, startsAt: string | null, localDate: string | null) => ({
      ...base,
      id,
      startsAt,
      localDate,
    });
    const games = [
      game('yesterday', null, '2026-11-12'),
      game('earlier-today', '2026-11-14T01:00:00.000Z', '2026-11-13'),
      game('last-week', '2026-11-07T01:00:00.000Z', '2026-11-06'),
      game('tonight', '2026-11-14T04:00:00.000Z', '2026-11-13'),
      game('tomorrow', '2026-11-15T00:00:00.000Z', '2026-11-14'),
      game('no-day', null, null),
    ];
    const home = buildHomeGames(
      { ...schedule, rounds: [], unplacedGames: games },
      evening,
      addressee,
    );
    expect(home.awaiting.map((g) => g.id)).toEqual(['earlier-today', 'yesterday']);
    expect(home.awaiting.every((g) => g.awaiting === true)).toBe(true);
    // The list of games still to play is as it was: these are in it, after the coming ones.
    expect(home.upcoming.map((g) => g.id)).toEqual([
      'tonight',
      'tomorrow',
      'earlier-today',
      'yesterday',
      'last-week',
    ]);
    // On the home page none of them stands among the games to come.
    expect(homeNextGames(home.upcoming).map((g) => g.id)).toEqual(['tonight', 'tomorrow']);
    // On the schedule page its card carries the same mark.
    const listed = buildScheduleView(
      { ...schedule, rounds: [], unplacedGames: games },
      evening,
      addressee,
      {},
    ).rounds.flatMap((r) => r.games);
    expect(
      listed
        .filter((g) => g.awaiting === true)
        .map((g) => g.id)
        .sort(),
    ).toEqual(['earlier-today', 'last-week', 'yesterday'].sort());
  });

  it('is, of the made-up league’s games at the hour these tests are set to, only the one nobody scored three days ago', async () => {
    const { clock, schedule } = await load();
    const home = buildHomeGames(schedule, clock, addressee);
    // The game the games list's "Needs a result" opens on (step 2.156).
    expect(home.awaiting.map((g) => gameLinkText(g, gameLinkWords()))).toEqual([
      'Badgers against Herons, Tue, Nov 10, 7:00 PM, awaiting the result',
    ]);
    expect(homeNextGames(home.upcoming).some((g) => g.awaiting === true)).toBe(false);
  });
});

const card = (id: string, status: GameView['status'], awaiting = false): GameView => ({
  id,
  home: { name: 'Home', score: null, color: null },
  away: { name: 'Away', score: null, color: null },
  status,
  whenText: 'Sat',
  detailsHref: `/x/games/${id}`,
  teamSlugs: [],
  ...(awaiting ? { awaiting: true } : {}),
});
const ids = (games: readonly GameView[]) => games.map((g) => g.id);

describe('the home page’s coming games', () => {
  const coming = (n: number) => Array.from({ length: n }, (_, i) => card(`c${i + 1}`, 'scheduled'));
  const off = (n: number) => Array.from({ length: n }, (_, i) => card(`p${i + 1}`, 'postponed'));

  it('are the next four still to start, then up to two waiting for a new day', () => {
    expect(ids(homeNextGames([...coming(5), ...off(3)]))).toEqual([
      'c1',
      'c2',
      'c3',
      'c4',
      'p1',
      'p2',
    ]);
    expect(ids(homeNextGames([card('live', 'live'), ...coming(2)]))).toEqual(['c1', 'c2']);
    expect(homeNextGames([])).toEqual([]);
  });

  it('never leave a coming game out to make the number even: a card left over takes the row', () => {
    // The code review, L1: an odd number is shown as it is (the grid gives the last card
    // the whole row), where a coming game used to give way.
    expect(ids(homeNextGames([...coming(4), ...off(1)]))).toEqual(['c1', 'c2', 'c3', 'c4', 'p1']);
    expect(ids(homeNextGames(coming(3)))).toEqual(['c1', 'c2', 'c3']);
    expect(ids(homeNextGames([...coming(3), ...off(2)]))).toEqual(['c1', 'c2', 'c3', 'p1', 'p2']);
    expect(ids(homeNextGames(coming(1)))).toEqual(['c1']);
    expect(ids(homeNextGames([...coming(2), ...off(1)]))).toEqual(['c1', 'c2', 'p1']);
    for (let c = 0; c <= 6; c++) {
      for (let p = 0; p <= 3; p++) {
        const shown = homeNextGames([...coming(c), ...off(p)]);
        // Every one of the next four, and of the first two waiting for a new day.
        expect(
          shown.filter((g) => g.status === 'scheduled'),
          `${c} and ${p}`,
        ).toHaveLength(Math.min(c, 4));
        expect(
          shown.filter((g) => g.status === 'postponed'),
          `${c} and ${p}`,
        ).toHaveLength(Math.min(p, 2));
      }
    }
  });

  it('never hold a game whose start has passed with no result', () => {
    const upcoming = [card('c1', 'scheduled'), card('late', 'scheduled', true), ...off(1)];
    expect(ids(homeNextGames(upcoming))).toEqual(['c1', 'p1']);
  });
});

describe('the home page’s results', () => {
  const finals = Array.from({ length: 5 }, (_, i) => card(`f${i + 1}`, 'final'));
  const table = (rows: number, hasNotes = false) => ({ rows, hasNotes });

  it('are about as many as the standings beside them are tall, from two to five', () => {
    // One short table: two results.
    expect(ids(homeResults(finals, [], [table(3, true)]))).toEqual(['f1', 'f2']);
    // Two divisions of three and two, with notes: still two.
    expect(homeResults(finals, [], [table(3, true), table(2, true)])).toHaveLength(2);
    // A division of twelve: three. Two of ten: five, and never more.
    expect(homeResults(finals, [], [table(12)])).toHaveLength(3);
    expect(homeResults(finals, [], [table(10), table(10)])).toHaveLength(5);
    expect(homeResults(finals, [], [table(30), table(30)])).toHaveLength(5);
    // No standings yet: two.
    expect(homeResults(finals, [], [])).toHaveLength(2);
    expect(homeResults(finals.slice(0, 1), [], [table(12)])).toHaveLength(1);
  });

  it('with more than two tables stand across the page instead: four of them', () => {
    expect(homeResults(finals, [], [table(4), table(4), table(4)])).toHaveLength(4);
  });

  it('open with decided games; a game waiting for its result comes after them, inside the number', () => {
    const late = [card('late', 'scheduled', true)];
    const two = [card('late', 'scheduled', true), card('later', 'scheduled', true)];
    // Room for two beside one short table: one result, then the game that is waiting. The
    // column is as tall as it was with two results, so it still ends level with the table.
    expect(ids(homeResults(finals, late, [table(3, true)]))).toEqual(['f1', 'late']);
    // A waiting game never takes the last decided game's place.
    expect(ids(homeResults(finals, two, [table(3, true)]))).toEqual(['f1', 'late']);
    // Room for three, and for five.
    expect(ids(homeResults(finals, two, [table(12)]))).toEqual(['f1', 'late', 'later']);
    expect(ids(homeResults(finals, late, [table(10), table(10)]))).toEqual([
      'f1',
      'f2',
      'f3',
      'f4',
      'late',
    ]);
    // Across the page, with more than two tables: four in all.
    expect(ids(homeResults(finals, two, [table(4), table(4), table(4)]))).toEqual([
      'f1',
      'f2',
      'late',
      'later',
    ]);
    // Never more than the number without one, whatever is waiting.
    for (const tables of [[], [table(3, true)], [table(12)], [table(10), table(10)]]) {
      const without = homeResults(finals, [], tables).length;
      for (const waiting of [late, two]) {
        expect(homeResults(finals, waiting, tables)).toHaveLength(without);
      }
    }
  });

  it('with nothing decided yet are the games waiting for their results, and decided games fill what those leave', () => {
    const two = [card('late', 'scheduled', true), card('later', 'scheduled', true)];
    expect(ids(homeResults([], two, [table(3, true)]))).toEqual(['late', 'later']);
    expect(ids(homeResults(finals.slice(0, 1), two, [table(12)]))).toEqual(['f1', 'late', 'later']);
    expect(homeResults([], [], [table(12)])).toEqual([]);
  });
});

describe('where the home page’s leaders stand', () => {
  const table = (rows: number, hasNotes = false) => ({ rows, hasNotes });

  it('under a column of standings that is shorter than the games beside it, as many as close the hole', () => {
    // One table of three teams with a note beside two boards (the second made-up league):
    // the hole is about one leader's card high.
    expect(homeLeadersPlace(2, [table(3, true)], 3)).toEqual({ beside: 1, across: 0 });
    // The same table beside three boards: room for two; beside five, for all three.
    expect(homeLeadersPlace(3, [table(3, true)], 3)).toEqual({ beside: 2, across: 0 });
    expect(homeLeadersPlace(5, [table(3, true)], 3)).toEqual({ beside: 3, across: 0 });
    // Never more than there are.
    expect(homeLeadersPlace(5, [table(3, true)], 1)).toEqual({ beside: 1, across: 0 });
  });

  it('across the page, in a section of their own, when the two columns already end level', () => {
    // Two divisions of three and two with notes beside two boards (the first league).
    expect(homeLeadersPlace(2, [table(3, true), table(2, true)], 3)).toEqual({
      beside: 0,
      across: 3,
    });
    expect(homeLeadersPlace(3, [table(12)], 2)).toEqual({ beside: 0, across: 2 });
    // No games beside the standings, no standings, or tables that lie across the page.
    expect(homeLeadersPlace(0, [table(3)], 3)).toEqual({ beside: 0, across: 3 });
    expect(homeLeadersPlace(2, [], 3)).toEqual({ beside: 0, across: 3 });
    expect(homeLeadersPlace(4, [table(4), table(4), table(4)], 3)).toEqual({
      beside: 0,
      across: 3,
    });
  });

  it('names each leader once, and nobody when there are none', () => {
    expect(homeLeadersPlace(2, [table(3, true)], 0)).toEqual({ beside: 0, across: 0 });
    for (let boards = 0; boards <= 5; boards++) {
      for (let rows = 1; rows <= 14; rows++) {
        for (let leaders = 0; leaders <= 3; leaders++) {
          const place = homeLeadersPlace(boards, [table(rows)], leaders);
          expect(Math.min(place.beside, place.across)).toBe(0);
          expect(place.beside + place.across).toBeLessThanOrEqual(leaders);
          if (place.beside === 0) expect(place.across).toBe(leaders);
        }
      }
    }
  });
});
