// The made-up world's clock for a check, at every hour (step 2.249, T-425): whatever hour
// the machine reads when a browser test starts, `worldAtNoon()` starts the made-up world at
// noon on the league's today, and that world holds a decided game of the league's current
// season dated its today, which Admin → Games lists under Today with "Correct this result"
// (the check "the owner finds a decided game to correct" in new-season-test.mjs). The
// machine's clock is pretended every three hours across a whole day, in UTC and in the
// league's zone, and a few minutes either side of midnight in both, on a day of standard
// time and one of summer time. Started from the machine's clock instead, the world made
// between the league's midnight and 03:00 has that game last night, under Earlier games.
import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { leagueDay, worldAtNoon } from '../scripts/league-clock.mjs';
import { standInSeedCast } from '../apps/web/src/server/stand-in-cast.ts';
import { dayIn } from '../apps/web/src/server/stand-in-world-clock.ts';
import { madeUpLeagues } from '../apps/web/src/server/stand-in-world-seed.ts';

/** The pretended machine clocks: a day of standard time (UTC−6) and one of summer time (UTC−5). */
const machineClocks = (() => {
  const all = [];
  for (const [day, offset] of [
    ['2026-11-25', 6],
    ['2026-07-15', 5],
  ]) {
    const start = Date.parse(`${day}T00:00:00Z`);
    for (let h = 0; h < 24; h += 3) {
      all.push(start + h * 3_600_000); // every three hours in UTC
      all.push(start + (h + offset) * 3_600_000); // every three hours in the league's zone
    }
    for (const minutes of [-5, -1, 0, 1, 5, 59]) {
      all.push(start + minutes * 60_000); // around midnight in UTC
      all.push(start + offset * 3_600_000 + minutes * 60_000); // around the league's midnight
    }
  }
  return [...new Set(all)].sort((a, b) => a - b);
})();

afterEach(() => mock.timers.reset());

test('the world a check starts at noon holds a decided game on the league’s today, at every hour', () => {
  assert.ok(machineClocks.length >= 40);
  for (const machine of machineClocks) {
    mock.timers.enable({ apis: ['Date'], now: machine });
    const worldNow = worldAtNoon(['node', 'a-test.mjs']);
    mock.timers.reset();
    const at = `machine ${new Date(machine).toISOString()}, world ${worldNow}`;
    const [league] = madeUpLeagues(standInSeedCast, new Date(worldNow));
    assert.ok(league !== undefined && league.currentSeasonId !== null, at);
    const today = dayIn(new Date(worldNow), league.timeZone);
    // Noon on the league's own today, the day its zone reads on the machine's clock.
    assert.equal(today, leagueDay(new Date(machine).toISOString(), 0), at);
    assert.equal(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: league.timeZone,
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(worldNow)),
      '12:00',
      at,
    );
    const decidedToday = league.games.filter(
      (g) =>
        g.seasonId === league.currentSeasonId &&
        (g.status === 'final' || g.status === 'forfeit') &&
        g.localDate === today &&
        g.startsAt !== null &&
        g.startsAt <= worldNow,
    );
    assert.ok(decidedToday.length > 0, `${at}: no decided game today`);
  }
});
