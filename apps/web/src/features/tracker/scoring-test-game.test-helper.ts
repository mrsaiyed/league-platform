// A made-up game for the scoring screen's tests: two teams of eight on the device, and
// the engine itself to play it, so what a test expects is always the engine's own result.
import { basketball } from '@srleagues/sports';
import type { DevicePlayer, DeviceRosters } from './opened-game-storage.ts';

export const madeUpPlayer = (
  personId: string,
  jerseyNumber: string | null,
  firstName: string,
  lastName: string,
  left = false,
): DevicePlayer => ({
  personId,
  jerseyNumber,
  firstName,
  lastName,
  left,
  addedAtGameId: null,
  toReview: false,
});

/** Home players h3, h5… by jersey; away a3, a5…; each team's sixth to eighth sit out. */
const numbers = ['3', '5', '7', '9', '11', '13', '20', '21'];
const team = (prefix: string, family: string, names: readonly string[]): DevicePlayer[] =>
  numbers.map((n, i) => madeUpPlayer(`${prefix}${n}`, n, names[i] ?? '', family));

export const testRosters: DeviceRosters = {
  home: {
    teamId: 'team-home',
    name: 'Hawks',
    players: team('h', 'Hawkins', ['Max', 'Ned', 'Oz', 'Pia', 'Quin', 'Ray', 'Sam', 'Tess']),
  },
  away: {
    teamId: 'team-away',
    name: 'Bears',
    players: team('a', 'Bearsley', ['Sol', 'Tam', 'Uma', 'Vic', 'Wes', 'Xan', 'Yan', 'Zoe']),
  },
  uniqueJerseys: false,
};

export const homeFive = ['h3', 'h5', 'h7', 'h9', 'h11'];
export const awayFive = ['a3', 'a5', 'a7', 'a9', 'a11'];

/** Plays `commands` on the engine, one after another, each a second after the last. */
export function played(
  commands: readonly basketball.Command[],
  from: basketball.GameState = basketball.newGame(basketball.QUARTERS, 0),
): basketball.GameState {
  let state = from;
  commands.forEach((command, index) => {
    state = basketball.apply(state, command, {
      id: `test-${state.recent.length}-${index}`,
      now: state.lastAt + 1000,
    });
  });
  return state;
}

/** Both lineups set: the game every in-play test starts from. */
export const tippedOff = (rules: basketball.Rules = basketball.QUARTERS): basketball.GameState =>
  played(
    [
      { type: 'lineup', side: 'home', playerIds: homeFive },
      { type: 'lineup', side: 'away', playerIds: awayFive },
    ],
    basketball.newGame(rules, 0),
  );
