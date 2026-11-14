// The home and schedule pages' content (step 2.42), on the made-up stand-in schedules:
// the two leagues differ, past rounds are closed and the current one open, the team and
// round choices narrow the list, and a live message moves a game without a refresh.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { standInPublicSchedule } from '../../server/stand-in-public-schedule.ts';
import { standInPublicStats } from '../../server/stand-in-public-stats.ts';
import { buildHomeGames, buildScheduleView, parseRound } from './build-schedule.ts';
import { applyUpdate } from './live-game-list.tsx';
import { RoundSections } from './schedule-views.tsx';

const adult = '01900000-0000-7000-8000-000000000001';
const youth = '01900000-0000-7000-8000-000000000002';
const now = () => new Date('2026-11-13T15:00:00Z');
const schedules = standInPublicSchedule({ adultLeagueId: adult, youthLeagueId: youth }, now);
const stats = standInPublicStats({ adultLeagueId: adult, youthLeagueId: youth });
const addressee = { id: adult, slug: 'north', customDomain: null } as never;

async function load(leagueId: string, index = 0) {
  const seasons = await stats.seasonsOf(leagueId);
  const season = seasons[index];
  if (season === undefined) throw new Error('no season');
  const clock = await schedules.clockOf(leagueId);
  const schedule = await schedules.scheduleOf(leagueId, season.id, clock.today);
  if (schedule === undefined) throw new Error('no schedule');
  return { clock, schedule };
}

describe('schedule', () => {
  it('closes past rounds and opens the current and coming ones', async () => {
    const { clock, schedule } = await load(adult);
    const view = buildScheduleView(schedule, clock, addressee, {});
    const phases = view.rounds.map((r) => [r.phase, r.open]);
    expect(phases).toContainEqual(['past', false]);
    expect(phases).toContainEqual(['current', true]);
    expect(phases).toContainEqual(['upcoming', true]);
    expect(view.seasonIsEmpty).toBe(false);
  });

  it('the two leagues look different', async () => {
    const a = await load(adult);
    const y = await load(youth);
    const av = buildScheduleView(a.schedule, a.clock, addressee, {});
    const yv = buildScheduleView(y.schedule, y.clock, addressee, {});
    expect(yv.rounds.some((r) => r.title === 'Opening day')).toBe(true);
    expect(yv.rounds.some((r) => r.number === null)).toBe(true);
    expect(av.rounds.length).not.toBe(yv.rounds.length);
  });

  it('narrows to one team or one round, ignoring names it does not know', async () => {
    const { clock, schedule } = await load(adult);
    const team = buildScheduleView(schedule, clock, addressee, { team: 'falcons' });
    expect(team.rounds.flatMap((r) => r.games).every((g) => g.teamSlugs.includes('falcons'))).toBe(
      true,
    );
    const round = buildScheduleView(schedule, clock, addressee, { round: 2 });
    expect(round.rounds).toHaveLength(1);
    expect(round.rounds[0]?.open).toBe(true);
    const unknown = buildScheduleView(schedule, clock, addressee, { round: 99 });
    expect(unknown.rounds.length).toBeGreaterThan(1);
    expect(parseRound('3')).toBe(3);
    expect(parseRound('0')).toBeUndefined();
    expect(parseRound('x')).toBeUndefined();
  });

  it('a finished game links to its page; a live one is marked live', async () => {
    const { clock, schedule } = await load(adult);
    const games = buildScheduleView(schedule, clock, addressee, {}).rounds.flatMap((r) => r.games);
    expect(games.find((g) => g.status === 'final')?.detailsHref).toContain('/games/');
    expect(games.find((g) => g.status === 'live')?.detailsHref).toBeUndefined();
    const html = renderToStaticMarkup(
      createElement(RoundSections, {
        leagueId: adult,
        rounds: buildScheduleView(schedule, clock, addressee, {}).rounds,
      }),
    );
    expect(html).toContain('Live');
  });

  it('says when on one line and where on the next, and no place for a game without one', async () => {
    const { clock, schedule } = await load(adult);
    const games = buildScheduleView(schedule, clock, addressee, {}).rounds.flatMap((r) => r.games);
    const placed = games.find((g) => g.placeText !== undefined);
    expect(placed?.placeText).toMatch(/^Central Gym, Court \d$/);
    // When is only when: the place is never run into it.
    for (const game of games) expect(game.whenText).not.toContain('Central Gym');
    const first = schedule.rounds.flatMap((r) => r.games)[0];
    if (first === undefined) throw new Error('no game');
    const nowhere = { ...first, id: 'x2', venue: null, courtName: null };
    const changed = { ...schedule, unplacedGames: [nowhere] };
    const views = buildScheduleView(changed, clock, addressee, {}).rounds.flatMap((r) => r.games);
    expect(views.find((g) => g.id === 'x2')).toBeDefined();
    expect(views.find((g) => g.id === 'x2')?.placeText).toBeUndefined();
    const html = renderToStaticMarkup(
      createElement(RoundSections, {
        leagueId: adult,
        rounds: buildScheduleView(schedule, clock, addressee, {}).rounds,
      }),
    );
    expect(html).toMatch(/<span class="ui-game-place" dir="auto">Central Gym, Court \d<\/span>/);
  });
});

describe('home', () => {
  it('lists the newest finished games and the games still to play, live first', async () => {
    const { clock, schedule } = await load(adult);
    const home = buildHomeGames(schedule, clock, addressee);
    expect(home.recent.every((g) => g.status === 'final' || g.status === 'forfeit')).toBe(true);
    expect(home.upcoming[0]?.status).toBe('live');
    expect(home.recent.length).toBeLessThanOrEqual(5);
  });
});

describe('upcoming games', () => {
  const upcomingOf = async () => {
    const { clock, schedule } = await load(adult);
    const everyGame = schedule.rounds.flatMap((r) => r.games);
    return { clock, schedule, everyGame, home: buildHomeGames(schedule, clock, addressee) };
  };

  it('never puts a postponed game, dated in the past, first as if it were the next game', async () => {
    const { clock, everyGame, home } = await upcomingOf();
    // The made-up league has one: postponed two rounds ago, with no new date.
    const postponed = everyGame.find((g) => g.status === 'postponed');
    expect(postponed?.localDate !== null && (postponed?.localDate ?? '') < clock.today).toBe(true);
    const statuses = home.upcoming.map((g) => g.status);
    expect(statuses).toContain('postponed');
    // Every postponed game comes after every game still to play.
    expect(statuses.lastIndexOf('scheduled')).toBeLessThan(statuses.indexOf('postponed'));
    expect(statuses.indexOf('live')).toBe(0);
    // The games still to play are in the order they are played, from today on.
    const coming = home.upcoming.filter((g) => g.status === 'scheduled').map((g) => g.id);
    const byStart = everyGame
      .filter((g) => g.status === 'scheduled' && (g.localDate ?? '') >= clock.today)
      .sort((a, b) => Date.parse(a.startsAt ?? '') - Date.parse(b.startsAt ?? ''))
      .map((g) => g.id);
    expect(coming).toEqual(byStart.slice(0, coming.length));
  });

  it('says a postponed game was postponed from its old day, never the bare day', async () => {
    const { home } = await upcomingOf();
    const card = home.upcoming.find((g) => g.status === 'postponed');
    expect(card?.whenText).toMatch(/^Postponed from [A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}$/);
    // The same card on the schedule page, in the round it was to be played in.
    const { clock, schedule } = await load(adult);
    const listed = buildScheduleView(schedule, clock, addressee, {})
      .rounds.flatMap((r) => r.games)
      .find((g) => g.status === 'postponed');
    expect(listed?.whenText).toBe(card?.whenText);
    // One with no day at all says a new one is to come.
    const undated = schedule.rounds
      .flatMap((r) => r.games)
      .filter((g) => g.status === 'postponed')
      .map((g) => ({ ...g, startsAt: null, localDate: null }));
    const changed = { ...schedule, rounds: [], unplacedGames: undated };
    expect(buildHomeGames(changed, clock, addressee).upcoming[0]?.whenText).toBe(
      'New date to be announced',
    );
  });

  it('puts a game with no day, and one whose day has passed with no result, after the dated ones', async () => {
    const { clock, schedule, everyGame } = await upcomingOf();
    const next = everyGame.find(
      (g) => g.status === 'scheduled' && (g.localDate ?? '') > clock.today,
    );
    if (next === undefined) throw new Error('no coming game');
    const undated = { ...next, id: 'no-day', startsAt: null, localDate: null };
    const overdue = { ...next, id: 'overdue', startsAt: null, localDate: '2026-01-01' };
    const postponed = { ...next, id: 'off', status: 'postponed' };
    const changed = {
      ...schedule,
      rounds: [],
      unplacedGames: [postponed, overdue, undated, next],
    };
    const ids = buildHomeGames(changed, clock, addressee).upcoming.map((g) => g.id);
    expect(ids).toEqual([next.id, 'no-day', 'overdue', 'off']);
  });

  it('keeps postponed games from taking a coming game its place in the list', async () => {
    const { clock, schedule, everyGame } = await upcomingOf();
    const next = everyGame.find((g) => g.status === 'scheduled');
    if (next === undefined) throw new Error('no coming game');
    const many = Array.from({ length: 8 }, (_, i) => ({ ...next, id: `g${i}` }));
    const off = Array.from({ length: 8 }, (_, i) => ({
      ...next,
      id: `p${i}`,
      status: 'postponed',
    }));
    const changed = { ...schedule, rounds: [], unplacedGames: [...off, ...many] };
    const statuses = buildHomeGames(changed, clock, addressee).upcoming.map((g) => g.status);
    expect(statuses.filter((s) => s === 'scheduled')).toHaveLength(5);
    expect(statuses.filter((s) => s === 'postponed')).toHaveLength(5);
    expect(statuses.indexOf('postponed')).toBe(5);
  });
});

describe('live updates', () => {
  it('moves a game to the newest score without a refresh', async () => {
    const { clock, schedule } = await load(adult);
    const game = buildHomeGames(schedule, clock, addressee).upcoming.find(
      (g) => g.status === 'live',
    );
    if (game === undefined) throw new Error('no live game');
    const moved = applyUpdate(game, { sequence: 5, status: 'live', home: 45, away: 40 });
    expect(moved.home.score).toBe(45);
    expect(applyUpdate(game, undefined)).toBe(game);
    expect(applyUpdate(game, { sequence: 6, status: 'final', home: 50, away: 40 }).status).toBe(
      'final',
    );
  });
});

describe('recent results order', () => {
  it('puts a finished game with no time last, not first', async () => {
    const { clock, schedule } = await load(adult);
    const first = schedule.rounds.flatMap((r) => r.games).find((g) => g.status === 'final');
    if (first === undefined) throw new Error('no game');
    const undated = { ...first, id: 'x1', startsAt: null, localDate: null };
    const changed = { ...schedule, unplacedGames: [...schedule.unplacedGames, undated] };
    const recent = buildHomeGames(changed, clock, addressee).recent;
    expect(recent[0]?.id).not.toBe('x1');
  });

  it('gives a game that finishes live its box score link', async () => {
    const { clock, schedule } = await load(adult);
    const game = buildHomeGames(schedule, clock, addressee).upcoming.find(
      (g) => g.status === 'live',
    );
    if (game === undefined) throw new Error('no live game');
    expect(game.detailsHref).toBeUndefined();
    const done = applyUpdate(game, { sequence: 9, status: 'final', home: 50, away: 40 });
    expect(done.detailsHref).toContain('/games/');
  });
});
