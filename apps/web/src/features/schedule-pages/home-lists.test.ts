// What the home page lists (step 2.147), on the made-up stand-in schedule: a game whose
// start has passed with no result is never among the games to come, the coming games are
// an even number wherever one can give way, and the results follow the height of the
// standings beside them.
import { describe, expect, it } from 'vitest';
import { standInPublicSchedule } from '../../server/stand-in-public-schedule.ts';
import { standInPublicStats } from '../../server/stand-in-public-stats.ts';
import { buildHomeGames, buildScheduleView, gameView, type GameView } from './build-schedule.ts';
import { gameLinkText } from './game-link-text.ts';
import { homeNextGames, homeResults } from './home-lists.ts';
import { gameLinkWords } from './schedule-views.tsx';

const adult = '01900000-0000-7000-8000-000000000001';
const youth = '01900000-0000-7000-8000-000000000002';
const now = () => new Date('2026-11-13T15:00:00Z');
const schedules = standInPublicSchedule({ adultLeagueId: adult, youthLeagueId: youth }, now);
const stats = standInPublicStats({ adultLeagueId: adult, youthLeagueId: youth });
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

  it('is none of the made-up league’s games at the hour these tests are set to', async () => {
    const { clock, schedule } = await load();
    expect(buildHomeGames(schedule, clock, addressee).awaiting).toEqual([]);
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

  it('are an even number wherever a coming game can give way, so no card has a hole beside it', () => {
    // Four coming and one postponed: the fourth coming game gives way.
    expect(ids(homeNextGames([...coming(4), ...off(1)]))).toEqual(['c1', 'c2', 'c3', 'p1']);
    expect(ids(homeNextGames(coming(3)))).toEqual(['c1', 'c2']);
    expect(ids(homeNextGames([...coming(3), ...off(2)]))).toEqual(['c1', 'c2', 'p1', 'p2']);
    // Too few to give one up: shown whole, and the last card takes the row (the grid's rule).
    expect(ids(homeNextGames(coming(1)))).toEqual(['c1']);
    expect(ids(homeNextGames([...coming(2), ...off(1)]))).toEqual(['c1', 'c2', 'p1']);
    for (let c = 0; c <= 6; c++) {
      for (let p = 0; p <= 3; p++) {
        const shown = homeNextGames([...coming(c), ...off(p)]);
        if (Math.min(c, 4) >= 3) expect(shown.length % 2, `${c} and ${p}`).toBe(0);
        // A postponed game is never dropped to make the number even.
        expect(shown.filter((g) => g.status === 'postponed')).toHaveLength(Math.min(p, 2));
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

  it('open with a game waiting for its result, which takes no result’s place', () => {
    const late = [card('late', 'scheduled', true)];
    expect(ids(homeResults(finals, late, [table(3, true)]))).toEqual(['late', 'f1', 'f2']);
    const two = [card('late', 'scheduled', true), card('later', 'scheduled', true)];
    expect(ids(homeResults(finals, two, [table(3, true)]))).toEqual(['late', 'later', 'f1']);
  });
});
