// A unit test's made-up world does not depend on the hour the test runs at (step 2.175).
// The seed places its games around the moment the world starts and a day's list starts
// at the league's own midnight (S-59), so a world started at the real hour put its final
// games on yesterday's list from midnight until about three, and tests that need one on
// today's list failed then. The world a test gets by default starts at noon of the
// league's day (atLeagueNoon in stand-in-world.test-helper.ts): here it is built with only
// the test's own "now" moved to five hours of the league's night and day, and on the days
// the clocks change, and today's lists hold the same final and live games at each.
import { listMyGames } from '@srleagues/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { namesShownOf, startingNamePolicy } from './name-policy-of.ts';
import { standInLeagues, standInPeople } from './stand-in-cast.ts';
import { standInGames } from './stand-in-games.ts';
import { dayIn, momentIn, timeIn } from './stand-in-world-clock.ts';
import { adultTimeZone } from './stand-in-world-seed.ts';
import { testWorld } from './stand-in-world.test-helper.ts';

const owner = standInPeople.owner.accountId;
const leagues = [standInLeagues.live.id, standInLeagues.other.id, standInLeagues.draft.id];
const hours = ['00:10', '01:30', '02:50', '12:00', '23:50'];

/** The test's own "now" only: this computer's clock is never touched. */
function testNowAt(day: string, time: string): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(momentIn(day, time, adultTimeZone)));
}

/** Each league's today and its decided and live games on today's list, by the default world. */
async function todaysLists() {
  const world = testWorld();
  const ports = standInGames(world, {
    people: {},
    namesShownOf: namesShownOf(startingNamePolicy, () => 'adult'),
  });
  const lists = [];
  for (const leagueId of leagues) {
    const listed = await listMyGames(
      { leagueId, accountId: owner, requestId: 'hour' },
      {},
      ports.deps,
    );
    const games = listed.ok ? listed.value.games : [];
    const ids = (kept: (status: string) => boolean) =>
      games
        .filter((g) => kept(g.status))
        .map((g) => g.id)
        .sort();
    lists.push({
      leagueId,
      decided: ids((s) => s === 'final' || s === 'forfeit'),
      live: ids((s) => s === 'live'),
    });
  }
  return { startedAt: world.now(), lists };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("a unit test's made-up world, whatever the hour", () => {
  it('starts at noon of the league’s day and lists the same games at every hour of it', async () => {
    const today = dayIn(new Date(), adultTimeZone);
    testNowAt(today, '12:00');
    const atNoon = await todaysLists();
    const adult = atNoon.lists[0];
    // What the box score and reopen tests need on today's list: decided games, and the
    // game under way.
    expect(adult?.decided.length).toBeGreaterThan(0);
    expect(adult?.live.length).toBeGreaterThan(0);
    for (const time of hours) {
      testNowAt(today, time);
      const seen = await todaysLists();
      expect(seen.lists, time).toEqual(atNoon.lists);
      expect(dayIn(seen.startedAt, adultTimeZone), time).toBe(today);
      expect(timeIn(seen.startedAt, adultTimeZone), time).toBe('12:00');
    }
  });

  it('starts at noon on the days the clocks change, too', async () => {
    // 2026's change in spring and in autumn in the adult league's zone.
    for (const day of ['2026-03-08', '2026-11-01']) {
      for (const time of ['00:10', '23:50']) {
        testNowAt(day, time);
        const seen = await todaysLists();
        expect(seen.lists[0]?.decided.length, `${day} ${time}`).toBeGreaterThan(0);
        expect(dayIn(seen.startedAt, adultTimeZone), `${day} ${time}`).toBe(day);
        expect(timeIn(seen.startedAt, adultTimeZone), `${day} ${time}`).toBe('12:00');
      }
    }
  });

  it('keeps the clock a test gives it: a test about the hour still sets its own', () => {
    const afterMidnight = new Date(momentIn('2026-11-16', '00:20', adultTimeZone));
    const world = testWorld(undefined, () => afterMidnight);
    expect(world.now()).toEqual(afterMidnight);
  });
});
