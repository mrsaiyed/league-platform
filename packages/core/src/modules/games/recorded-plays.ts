// Where the line of S-40 falls (step 2.121): whether a game holds something a
// scorekeeper may not clear on their own. Lineups, substitutions, timeouts, jersey
// colors and every clock tap (start, pause, period, setting the clock, the clock mode)
// are "lineups and clock taps". A basket, a foul or a turnover (a team turnover too)
// counts while it stands in the game's present state: one undone, or a foul or
// turnover taken back, is nothing recorded, as the scoreboard the scorekeeper sees
// shows nothing. Read from the engine's own counts, so the line is the engine's.
import { basketball } from '@srleagues/sports';

/** True if the state holds a basket, foul or turnover that has not been undone or taken back. */
export function holdsRecordedPlays(state: basketball.GameState): boolean {
  const teams = basketball.derive(state).teams;
  return (['home', 'away'] as const).some((side) => {
    const team = teams[side];
    return team.score > 0 || team.fouls > 0 || team.turnovers > 0;
  });
}
