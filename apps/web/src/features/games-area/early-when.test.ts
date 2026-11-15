// The games list's "This game is set for …. Make it final now?" follows the ports' clock
// (step 2.179), never this computer's: on a made-up world whose clock is years from this
// computer's, a game still to come by the world is asked about, and one that has come by
// the world is not, whatever this computer says.
import { describe, expect, it } from 'vitest';
import { standInLeagues } from '../../server/stand-in-cast.ts';
import { standInPublicSchedule } from '../../server/stand-in-public-schedule.ts';
import { standInGameId } from '../../server/stand-in-world-seed.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
import { earlyWhen } from './early-when.ts';

const leagueId = standInLeagues.live.id;

/** Lions v Tigers (game 1, 18:00 today in the league's zone), read on a world made at `at`. */
async function gameOneAt(at: string) {
  const world = testWorld(undefined, () => new Date(at));
  const clock = await standInPublicSchedule(world).clockOf(leagueId);
  const game = (await world.read(leagueId))?.games.find((g) => g.id === standInGameId(1));
  if (game === undefined) throw new Error('no game 1');
  return { clock, startsAt: game.startsAt };
}

describe('the question before a final score', () => {
  it('asks "set for" by the ports\' clock: a world long before this computer\'s', async () => {
    // 10:00 in Chicago on the world's day: game 1 at 18:00 is still to come there, though
    // by this computer's clock that day is long gone.
    const { clock, startsAt } = await gameOneAt('2020-06-01T15:00:00Z');
    expect(Date.parse(startsAt ?? '')).toBeLessThan(Date.now());
    const times = { locale: 'en-US', timeZone: clock.timeZone };
    expect(earlyWhen(startsAt, clock, times)).toMatch(/6:00\s?PM/);
  });

  it("does not ask once the game's time has come by the ports' clock: a world far ahead", async () => {
    // 21:00 in Chicago on the world's day: game 1 at 18:00 has begun there, though by this
    // computer's clock it is years away.
    const { clock, startsAt } = await gameOneAt('2040-06-02T02:00:00Z');
    expect(Date.parse(startsAt ?? '')).toBeGreaterThan(Date.now());
    const times = { locale: 'en-US', timeZone: clock.timeZone };
    expect(earlyWhen(startsAt, clock, times)).toBeUndefined();
  });
});
