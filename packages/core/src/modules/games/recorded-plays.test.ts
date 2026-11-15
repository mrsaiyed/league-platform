// The line of S-40, play type by play type, on each side (step 2.121).
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { holdsRecordedPlays } from './recorded-plays.ts';

const home = ['h1', 'h2', 'h3', 'h4', 'h5'];
const away = ['a1', 'a2', 'a3', 'a4', 'a5'];

/** The engine's state after these commands, one second apart. */
function after(commands: readonly basketball.Command[]): basketball.GameState {
  return commands.reduce(
    (state, command, i) => basketball.apply(state, command, { id: `c${i}`, now: (i + 1) * 1000 }),
    basketball.newGame(),
  );
}

const tipOff: basketball.Command[] = [
  { type: 'lineup', side: 'home', playerIds: home },
  { type: 'lineup', side: 'away', playerIds: away },
  { type: 'start' },
];

describe('what counts as something recorded (S-40)', () => {
  it('is nothing in a new game', () => {
    expect(holdsRecordedPlays(basketball.newGame())).toBe(false);
  });

  it('is nothing for lineups, substitutions, timeouts, colors and every clock tap', () => {
    const state = after([
      ...tipOff,
      { type: 'pause' },
      { type: 'set-clock', ms: 300_000 },
      { type: 'start' },
      { type: 'sub', side: 'home', inId: 'h6', outId: 'h1' },
      { type: 'timeout', side: 'away', seconds: 60 },
      { type: 'untimeout', side: 'away' },
      { type: 'timeout', side: 'home', seconds: 30 },
      { type: 'colors', swapped: true },
      { type: 'clock-mode', mode: 'running' },
      { type: 'period', period: 2 },
    ]);
    expect(state.status).toBe('live');
    expect(holdsRecordedPlays(state)).toBe(false);
  });

  it('is something for a basket of any value, a foul, a turnover and a team turnover', () => {
    const plays: basketball.Command[] = [
      { type: 'score', side: 'home', playerId: 'h1', points: 1 },
      { type: 'score', side: 'away', playerId: 'a1', points: 2 },
      { type: 'score', side: 'home', playerId: 'h2', points: 3 },
      { type: 'foul', side: 'away', playerId: 'a2' },
      { type: 'turnover', side: 'home', playerId: 'h3' },
      { type: 'team-turnover', side: 'away' },
    ];
    for (const play of plays) {
      expect(holdsRecordedPlays(after([...tipOff, play])), play.type).toBe(true);
    }
  });

  it('is something even before the clock has run', () => {
    const lineups = tipOff.slice(0, 2);
    expect(
      holdsRecordedPlays(after([...lineups, { type: 'foul', side: 'home', playerId: 'h1' }])),
    ).toBe(true);
  });

  it('is nothing once each of those is undone, and something again once it is redone', () => {
    const plays: basketball.Command[] = [
      { type: 'score', side: 'home', playerId: 'h1', points: 2 },
      { type: 'foul', side: 'away', playerId: 'a2' },
      { type: 'turnover', side: 'home', playerId: 'h3' },
      { type: 'team-turnover', side: 'away' },
    ];
    for (const play of plays) {
      const undone = after([...tipOff, play, { type: 'undo' }]);
      expect(holdsRecordedPlays(undone), play.type).toBe(false);
      expect(holdsRecordedPlays(after([...tipOff, play, { type: 'undo' }, { type: 'redo' }]))).toBe(
        true,
      );
    }
  });

  it('is nothing once a foul or turnover is taken back with its own button', () => {
    expect(
      holdsRecordedPlays(
        after([
          ...tipOff,
          { type: 'foul', side: 'away', playerId: 'a2' },
          { type: 'unfoul', side: 'away', playerId: 'a2' },
          { type: 'turnover', side: 'home', playerId: 'h3' },
          { type: 'unturnover', side: 'home', playerId: 'h3' },
          { type: 'team-turnover', side: 'away' },
          { type: 'team-unturnover', side: 'away' },
        ]),
      ),
    ).toBe(false);
  });

  it('is something while any one still stands', () => {
    const state = after([
      ...tipOff,
      { type: 'score', side: 'home', playerId: 'h1', points: 2 },
      { type: 'foul', side: 'away', playerId: 'a2' },
      { type: 'undo' },
    ]);
    expect(holdsRecordedPlays(state)).toBe(true);
  });
});
