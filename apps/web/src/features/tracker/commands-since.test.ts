// Whose the commands since a state were, by ID (step 2.242, T-357).
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { commandsSince } from './commands-since.ts';
import type { ServerState } from './tracker-server.ts';

const at = (sequence: number, recent: string[], changes?: string[]): ServerState => ({
  sequence,
  state: { ...basketball.newGame(), recent },
  ...(changes === undefined ? {} : { changes }),
});
const own = (...ids: string[]) => new Set(ids);

describe('commands since a state, told by their IDs', () => {
  it('are its own when every command since is one it sent, plays and changes of players', () => {
    const from = at(2, ['p1', 'p2'], []);
    expect(commandsSince(from, at(4, ['p1', 'p2', 'p3'], ['a1']), own('p3', 'a1'))).toBe('own');
    expect(commandsSince(from, from, own())).toBe('own');
  });

  it('counts a refused add of its own as its own: it is in the list of changes', () => {
    const from = at(2, ['p1', 'p2'], []);
    expect(commandsSince(from, at(3, ['p1', 'p2'], ['refused-add']), own('refused-add'))).toBe(
      'own',
    );
  });

  it('are somebody else’s when one command since is not one it sent', () => {
    const from = at(3, ['p1'], ['a1']);
    expect(commandsSince(from, at(4, ['p1'], ['a1', 'other-add']), own('a1'))).toBe(
      'somebody-else',
    );
    expect(commandsSince(from, at(5, ['p1', 'other-play'], ['a1', 'a2']), own('a2'))).toBe(
      'somebody-else',
    );
  });

  it('never lets its own add taken before the state make up for another’s since', () => {
    // The own add `a1` is in the state it knew already: only `other-add` is since.
    const from = at(3, ['p1'], ['a1']);
    expect(commandsSince(from, at(4, ['p1'], ['a1', 'other-add']), own('a1', 'other-add2'))).toBe(
      'somebody-else',
    );
  });

  it('cannot tell when more commands came than the lists name, and says so', () => {
    // 301 since, the list of plays holding the last 300: one is not named.
    const plays = Array.from({ length: 301 }, (_, i) => `p${i}`);
    const now = at(301, plays.slice(1), []);
    expect(commandsSince(at(0, [], []), now, own(...plays))).toBe('cannot-tell');
    // A command the lists never name (one the server counts outside them).
    expect(commandsSince(at(1, ['p0'], []), at(3, ['p0', 'p1'], []), own('p1'))).toBe(
      'cannot-tell',
    );
  });

  it('cannot tell from a state with no list of changes (kept before this release)', () => {
    expect(commandsSince(at(2, ['p1']), at(3, ['p1'], ['a1']), own('a1'))).toBe('cannot-tell');
    expect(commandsSince(at(2, ['p1'], []), at(3, ['p1']), own('a1'))).toBe('cannot-tell');
    // Nothing since: nothing to tell.
    expect(commandsSince(at(2, ['p1']), at(2, ['p1']), own())).toBe('own');
  });

  it('cannot tell from a state with no list of changes when an older add by somebody else is listed (review L1)', () => {
    // `other-add` may be from before the state it knew, which has no list to say so.
    expect(commandsSince(at(3, ['p1']), at(4, ['p1', 'p2'], ['other-add']), own('p2'))).toBe(
      'cannot-tell',
    );
    // A play by somebody else since is told by the list of plays all the same.
    expect(
      commandsSince(at(3, ['p1']), at(5, ['p1', 'other-play'], ['other-add']), own('other-add')),
    ).toBe('somebody-else');
  });

  it('cannot tell when the state now is older than the one it knew', () => {
    expect(commandsSince(at(3, ['p1'], []), at(2, ['p1'], []), own())).toBe('cannot-tell');
  });
});
