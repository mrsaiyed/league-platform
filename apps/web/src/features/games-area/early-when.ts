// When a game is set for, said in the question beside its score boxes while its time has
// not come ("This game is set for …. Make it final now?"). Measured against the ports'
// clock, the same one the game's time was read from (LeagueClock.now, step 2.179): this
// computer's on a database, the made-up world's own on the stand-in. Never the computer's
// clock beside the made-up world's data.
import { gameWhenText, type LeagueTimes } from '../../server/game-when.ts';
import type { LeagueClock } from '../../server/public-schedule.ts';

/** The game's time in words while it is still to come by `clock`; undefined once it has come. */
export function earlyWhen(
  startsAt: string | null,
  clock: Pick<LeagueClock, 'now'>,
  times: LeagueTimes,
): string | undefined {
  return startsAt !== null && Date.parse(startsAt) > Date.parse(clock.now)
    ? gameWhenText(startsAt, times)
    : undefined;
}
