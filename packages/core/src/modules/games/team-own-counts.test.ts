import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { teamOwnCounts } from './team-own-counts.ts';

const home = ['h1', 'h2', 'h3', 'h4', 'h5'];
const away = ['a1', 'a2', 'a3', 'a4', 'a5'];

/** The engine's own state after these taps, a second apart. */
function played(commands: readonly basketball.Command[]): basketball.GameState {
  let state = basketball.newGame();
  for (const [i, command] of commands.entries()) {
    state = basketball.apply(state, command, { id: `c${i}`, now: 1_000 * (i + 1) });
  }
  return state;
}

const start: basketball.Command[] = [
  { type: 'lineup', side: 'home', playerIds: home },
  { type: 'lineup', side: 'away', playerIds: away },
  { type: 'start' },
];

describe('teamOwnCounts', () => {
  it("reads the audit's case 18: one turnover charged to the team, one to a player", () => {
    const state = played([
      ...start,
      { type: 'team-turnover', side: 'away' },
      { type: 'turnover', side: 'away', playerId: 'a2' },
    ]);
    // The engine's team count is 2; the team's own share is 1, in no player's line.
    expect(basketball.derive(state).teams.away.turnovers).toBe(2);
    expect(teamOwnCounts(state)).toEqual({
      home: { turnovers: 0, playersPlayed: true },
      away: { turnovers: 1, playersPlayed: true },
    });
  });

  it('counts what stands: an undone or taken-back team turnover is nothing', () => {
    const undone = played([...start, { type: 'team-turnover', side: 'home' }, { type: 'undo' }]);
    expect(teamOwnCounts(undone).home.turnovers).toBe(0);
    const takenBack = played([
      ...start,
      { type: 'team-turnover', side: 'home' },
      { type: 'team-turnover', side: 'home' },
      { type: 'team-unturnover', side: 'home' },
    ]);
    expect(teamOwnCounts(takenBack).home.turnovers).toBe(1);
  });

  it('says when no player of a team came on', () => {
    const state = played([
      { type: 'lineup', side: 'home', playerIds: home },
      { type: 'start' },
      { type: 'team-turnover', side: 'away' },
    ]);
    expect(teamOwnCounts(state).away).toEqual({ turnovers: 1, playersPlayed: false });
  });

  it('reads nothing from a state the engine did not write, or none', () => {
    const none = {
      home: { turnovers: 0, playersPlayed: false },
      away: { turnovers: 0, playersPlayed: false },
    };
    expect(teamOwnCounts(undefined)).toEqual(none);
    expect(teamOwnCounts({ version: 1, plays: [{ type: 'team-turnover', side: 'home' }] })).toEqual(
      none,
    );
    expect(teamOwnCounts({ version: 2, plays: [], redo: [], clock: {}, rules: {} })).toEqual(none);
  });
});
