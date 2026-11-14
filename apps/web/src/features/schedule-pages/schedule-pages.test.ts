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
