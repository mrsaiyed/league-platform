import { describe, expect, it } from 'vitest';
import { t } from '../../server/messages.ts';
import { notDoneOf, notDoneText } from './not-done-text.ts';

describe('a change not made because the game was called off meanwhile', () => {
  it('names the game it is about, then says why, as a refusal does', () => {
    expect(notDoneText('game-now-cancelled', 'Tigers at Lions')).toBe(
      `Tigers at Lions: ${t('admin.games.error.game-now-cancelled')}`,
    );
    expect(notDoneText('game-now-postponed', 'Tigers at Lions')).toBe(
      `Tigers at Lions: ${t('admin.games.error.game-now-postponed')}`,
    );
  });

  it('still says why when the game cannot be named', () => {
    expect(notDoneText('game-now-cancelled', undefined)).toBe(
      t('admin.games.error.game-now-cancelled'),
    );
  });

  it('is nothing for a notice of a change that was made', () => {
    expect(notDoneText('postpone', 'Tigers at Lions')).toBeUndefined();
    expect(notDoneOf('final')).toBeUndefined();
  });
});
