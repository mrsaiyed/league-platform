// Which sentence an empty games list says (step 2.156): of the whole league to someone who
// scores every game, of their own games to someone who scores only some.
import { describe, expect, it } from 'vitest';
import { earlierEmptyText, needsResultEmptyText } from './empty-list-text.ts';

describe('the empty games lists', () => {
  it('speak of the whole league to someone who scores every game', () => {
    expect(needsResultEmptyText(true)).toBe('Every game that has started has its result.');
    expect(earlierEmptyText(true)).toBe('There are no earlier games yet.');
  });

  it('speak only of their own games to someone who scores only some', () => {
    expect(needsResultEmptyText(false)).toBe(
      'Every game you score that has started has its result.',
    );
    expect(earlierEmptyText(false)).toBe('There are no earlier games you score yet.');
  });
});
