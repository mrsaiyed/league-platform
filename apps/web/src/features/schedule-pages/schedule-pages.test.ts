// The home and schedule pages' content (step 2.42), on the made-up stand-in schedules:
// the two leagues differ, past rounds are closed and the current one open, the team and
// round choices narrow the list, and a live message moves a game without a refresh.
import { readStandings } from '@srleagues/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { standInPublicSchedule } from '../../server/stand-in-public-schedule.ts';
import { standInPublicStats } from '../../server/stand-in-public-stats.ts';
import { startingNamePolicy } from '../../server/name-policy-of.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
import { buildStandingsViews } from '../stats-pages/index.ts';
import { buildHomeGames, buildScheduleView, comingOrder, parseRound } from './build-schedule.ts';
import { gameLinkText } from './game-link-text.ts';
import { compactStandings } from './home-page.tsx';
import { LatestResultsSection, latestResultsCount } from './latest-results.tsx';
import { applyUpdate } from './live-game-list.tsx';
import { RoundSections, gameLinkWords } from './schedule-views.tsx';

const adult = '01900000-0000-7000-8000-000000000001';
const youth = '01900000-0000-7000-8000-000000000002';
const now = () => new Date('2026-11-13T15:00:00Z');
const world = testWorld(undefined, now);
const schedules = standInPublicSchedule(world);
const stats = standInPublicStats(world, startingNamePolicy);
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

  it('a finished round that still holds a postponed game says so, and is not folded shut', async () => {
    const { clock, schedule } = await load(adult);
    const view = buildScheduleView(schedule, clock, addressee, {});
    const held = view.rounds.filter((r) => r.games.some((g) => g.status === 'postponed'));
    // The made-up season has one: round 2, two weeks ago, with one of its four games off.
    expect(held.map((r) => [r.number, r.phase, r.note, r.open])).toEqual([
      [2, 'past', '1 game postponed', true],
    ]);
    // Every other finished round is folded shut and has nothing more to say.
    const others = view.rounds.filter((r) => r.phase === 'past' && r.number !== 2);
    expect(others.length).toBeGreaterThan(0);
    expect(others.every((r) => !r.open && r.note === undefined)).toBe(true);
    // All four of them: the words count.
    const both = {
      ...schedule,
      rounds: schedule.rounds.map((r) =>
        r.number === 2 ? { ...r, games: r.games.map((g) => ({ ...g, status: 'postponed' })) } : r,
      ),
    };
    expect(
      buildScheduleView(both, clock, addressee, {}).rounds.find((r) => r.number === 2)?.note,
    ).toBe('4 games postponed');
    // A round that is not finished says nothing beside its mark: its cards are in view.
    const coming = {
      ...schedule,
      rounds: schedule.rounds.map((r) =>
        r.phase === 'upcoming'
          ? { ...r, games: r.games.map((g) => ({ ...g, status: 'postponed' })) }
          : r,
      ),
    };
    const upcoming = buildScheduleView(coming, clock, addressee, {}).rounds.filter(
      (r) => r.phase === 'upcoming',
    );
    expect(upcoming.every((r) => r.note === undefined && r.open)).toBe(true);
    // A team's own list counts only the games it shows.
    const falcons = buildScheduleView(schedule, clock, addressee, { team: 'falcons' });
    expect(falcons.rounds.every((r) => r.note === undefined)).toBe(true);
    const herons = buildScheduleView(schedule, clock, addressee, { team: 'herons' });
    expect(herons.rounds.find((r) => r.number === 2)?.note).toBe('1 game postponed');
    // Drawn beside the round's mark, in the open round.
    const html = renderToStaticMarkup(
      createElement(RoundSections, { leagueId: adult, rounds: view.rounds }),
    );
    expect(html).toMatch(
      /<details class="ui-group" open="" data-phase="past"><summary><h2 dir="auto">Round 2<\/h2><span class="ui-group-mark">Finished<\/span> <span class="ui-group-mark" data-kind="note">1 game postponed<\/span>/,
    );
    expect(html.match(/data-kind="note"/g)).toHaveLength(1);
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

  // The rule changed with the game page (step 2.45): before it, only a decided game had a
  // page to go to, and this test said a live game had no link. Every game has a page now,
  // finished for every state, so every card is one link to it (DESIGN.md, section 4, line 11).
  it('every game links to its own page, in every state; a live one is marked live', async () => {
    const { clock, schedule } = await load(adult);
    const games = buildScheduleView(schedule, clock, addressee, {}).rounds.flatMap((r) => r.games);
    // The made-up season has a game in each of these states.
    for (const status of ['final', 'forfeit', 'live', 'scheduled', 'postponed'] as const) {
      const game = games.find((g) => g.status === status);
      expect(game, status).toBeDefined();
      expect(game?.detailsHref, status).toMatch(new RegExp(`/games/${game?.id}\\b`));
    }
    expect(games.every((g) => g.detailsHref.includes(`/games/${g.id}`))).toBe(true);
    const html = renderToStaticMarkup(
      createElement(RoundSections, {
        leagueId: adult,
        rounds: buildScheduleView(schedule, clock, addressee, {}).rounds,
      }),
    );
    expect(html).toContain('Live');
    // One link a card, and as many cards as games.
    expect(html.match(/<a class="ui-game-link"/g)).toHaveLength(games.length);
    expect(html.match(/<article class="ui-game-card"/g)).toHaveLength(games.length);
  });

  it('says in the link, for a screen reader, what the game is and how it stands', async () => {
    const { clock, schedule } = await load(adult);
    const views = buildScheduleView(schedule, clock, addressee, {}).rounds.flatMap((r) => r.games);
    const words = gameLinkWords();
    // A scheduled game is still to come, or (awaiting) its start has passed with no result.
    const said = (status: string, awaiting = false) => {
      const game = views.find((g) => g.status === status && (g.awaiting === true) === awaiting);
      if (game === undefined) throw new Error(`no ${status} game`);
      return gameLinkText(game, words);
    };
    // The tracked game under way has no score yet: no play of it is kept in the world.
    expect(said('live')).toBe('Bears against Hawks, live');
    expect(said('final')).toBe('Herons against Falcons, final, 47 to 52');
    expect(said('forfeit')).toBe('Otters against Badgers, forfeit, 0 to 20');
    expect(said('postponed')).toBe('Herons against Otters, postponed');
    expect(said('scheduled')).toMatch(/^Herons against Falcons, [A-Z][a-z]{2}, [A-Z][a-z]{2} \d/);
    // The made-up game nobody scored, three days before the world's today (step 2.156).
    expect(said('scheduled', true)).toBe(
      'Badgers against Herons, Tue, Nov 10, 7:00 PM, awaiting the result',
    );
    // A live one with a score, a game with no day yet, a cancelled one, and a live one
    // whose score is not kept.
    const live = views.find((g) => g.status === 'live');
    if (live === undefined) throw new Error('no live game');
    const scored = {
      ...live,
      home: { ...live.home, score: 41 },
      away: { ...live.away, score: 38 },
    };
    expect(gameLinkText(scored, words)).toBe('Bears against Hawks, live, 38 to 41');
    expect(gameLinkText({ ...live, status: 'cancelled' }, words)).toBe(
      'Bears against Hawks, cancelled',
    );
    expect(gameLinkText({ ...scored, home: { ...scored.home, score: null } }, words)).toBe(
      'Bears against Hawks, live',
    );
    expect(
      gameLinkText({ ...live, status: 'scheduled', whenText: 'Date to be announced' }, words),
    ).toBe('Bears against Hawks, Date to be announced');
    // The words are on the card's link, and move with the score on the device.
    const html = renderToStaticMarkup(
      createElement(RoundSections, {
        leagueId: adult,
        rounds: buildScheduleView(schedule, clock, addressee, {}).rounds,
      }),
    );
    expect(html).toContain('<span dir="auto">Bears against Hawks, live</span></a>');
    const moved = applyUpdate(live, { sequence: 5, status: 'live', home: 45, away: 40 });
    expect(gameLinkText(moved, words)).toBe('Bears against Hawks, live, 40 to 45');
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

describe('the latest results under the standings', () => {
  it('are the newest decided games as boards, under a kicker and a title, with the way to the schedule', async () => {
    const { clock, schedule } = await load(adult);
    const games = buildHomeGames(schedule, clock, addressee).recent.slice(0, latestResultsCount);
    expect(games).toHaveLength(3);
    const html = renderToStaticMarkup(
      createElement(LatestResultsSection, { leagueId: adult, games, scheduleHref: '/x/schedule' }),
    );
    expect(html).toContain('<p class="ui-kicker">How they got here</p><h2>Latest results</h2>');
    expect(html).toContain('<a class="ui-more" href="/x/schedule">See the full schedule</a>');
    // Three boards at the page's width: one row of three on a laptop.
    expect(html).toContain('data-layout="board" data-across="two"');
    expect(html.match(/<article class="ui-game-card"/g)).toHaveLength(3);
    expect(html).not.toContain('data-status="scheduled"');
  });

  it('are not drawn while no game is decided', () => {
    expect(
      renderToStaticMarkup(
        createElement(LatestResultsSection, { leagueId: adult, games: [], scheduleHref: '/x' }),
      ),
    ).toBe('');
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
    // Short enough for a card's first line: the month and the day, no weekday.
    expect(card?.whenText).toMatch(/^Postponed from [A-Z][a-z]{2} \d{1,2}$/);
    // Beside a pill that already says "Postponed" (a scoreboard card) the word is not said
    // twice; the day is still never bare.
    expect(card?.whenBesidePill).toMatch(/^From [A-Z][a-z]{2} \d{1,2}$/);
    expect(card?.whenText.endsWith((card.whenBesidePill ?? '').slice('From '.length))).toBe(true);
    // A game that is not postponed has no second wording.
    for (const game of home.upcoming.filter((g) => g.status !== 'postponed')) {
      expect(game.whenBesidePill).toBeUndefined();
    }
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

  // The order between the last three was settled by the second code look (L2): a game whose
  // start has passed with no result now comes before one with no day (it was the other
  // way round), since its result is the nearer news.
  it('puts a game whose day has passed with no result, then one with no day, after the coming ones', async () => {
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
    expect(ids).toEqual([next.id, 'overdue', 'no-day', 'off']);
  });

  it("lists tonight's game ahead of one earlier today that has no result yet, by the league's own clock", async () => {
    const { schedule, everyGame } = await upcomingOf();
    const base = everyGame.find((g) => g.status === 'scheduled');
    if (base === undefined) throw new Error('no game');
    // 9:30 in the evening of November 13 in the league's zone (Chicago); by UTC it is
    // already 3:30 in the morning of the 14th. "Today" is the league's 13th.
    const clock = {
      today: '2026-11-13',
      now: '2026-11-14T03:30:00.000Z',
      timeZone: 'America/Chicago',
    };
    const game = (id: string, startsAt: string | null, localDate: string | null) => ({
      ...base,
      id,
      startsAt,
      localDate,
    });
    const games = [
      game('postponed', '2026-11-06T00:00:00.000Z', '2026-11-05'),
      game('no-day', null, null),
      // Yesterday in the league's zone, with a day and no time: passed.
      game('yesterday', null, '2026-11-12'),
      // 7 pm today in Chicago: started two and a half hours ago, no result yet.
      game('earlier-today', '2026-11-14T01:00:00.000Z', '2026-11-13'),
      // Today in the league's zone, time to be announced: by UTC's date it would be "yesterday".
      game('today-no-time', null, '2026-11-13'),
      // 10 pm tonight in Chicago: half an hour from now. The real next game.
      game('tonight', '2026-11-14T04:00:00.000Z', '2026-11-13'),
      game('tomorrow', '2026-11-15T00:00:00.000Z', '2026-11-14'),
    ].map((g) => (g.id === 'postponed' ? { ...g, status: 'postponed' } : g));
    const changed = { ...schedule, rounds: [], unplacedGames: games };
    // Seven games, and the home page lists five coming ones and then the postponed.
    const sorted = [...games].sort(comingOrder(clock)).map((g) => g.id);
    expect(sorted).toEqual([
      'tonight',
      'today-no-time',
      'tomorrow',
      'earlier-today',
      'yesterday',
      'no-day',
      'postponed',
    ]);
    const home = buildHomeGames(changed, clock, addressee).upcoming.map((g) => g.id);
    expect(home[0]).toBe('tonight');
    expect(home.indexOf('tonight')).toBeLessThan(home.indexOf('earlier-today'));
    expect(home.at(-1)).toBe('postponed');
    // An hour later tonight's game has started with no result: tomorrow's is the next one.
    const later = { ...clock, now: '2026-11-14T04:30:00.000Z' };
    expect([...games].sort(comingOrder(later)).map((g) => g.id)).toEqual([
      'today-no-time',
      'tomorrow',
      'tonight',
      'earlier-today',
      'yesterday',
      'no-day',
      'postponed',
    ]);
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

  // Changed with the rule above: a live game's card already leads to its page (it used to
  // get its link only when it finished), and it still does once the game is decided.
  it('a live game leads to its page, and still does when it finishes while the page is open', async () => {
    const { clock, schedule } = await load(adult);
    const game = buildHomeGames(schedule, clock, addressee).upcoming.find(
      (g) => g.status === 'live',
    );
    if (game === undefined) throw new Error('no live game');
    expect(game.detailsHref).toContain(`/games/${game.id}`);
    const done = applyUpdate(game, { sequence: 9, status: 'final', home: 50, away: 40 });
    expect(done.detailsHref).toBe(game.detailsHref);
    // Every game the home page lists is a link, the ones still to play and the postponed too.
    const home = buildHomeGames(schedule, clock, addressee);
    for (const listed of [...home.recent, ...home.upcoming]) {
      expect(listed.detailsHref, listed.status).toContain(`/games/${listed.id}`);
    }
  });
});

// The lead's review of step 2.195, item 3: one number, one way. The home page's small
// table writes a win percentage as the full table and the notes do: .667, never 0.667.
describe('the home page’s small standings', () => {
  it('writes PCT as the notes do, and keeps the notes, which carry their own numbers', async () => {
    const [season] = await stats.seasonsOf(adult);
    const result = await readStandings(stats.readStoreOf(adult), { seasonId: season?.id ?? '' });
    if (!result.ok) throw new Error('expected standings');
    const [east] = buildStandingsViews(result.value).map(compactStandings);
    expect(east?.columns.map((c) => c.key)).toEqual(['played', 'wins', 'losses', 'winPercentage']);
    expect(east?.rows.map((row) => row.cells['winPercentage'])).toEqual(['.667', '.667', '.000']);
    expect(east?.footnotes.map((f) => f.text)).toEqual([
      'Owls and Falcons are level on win percentage (.667). The game between them puts Owls ahead.',
    ]);
  });
});
