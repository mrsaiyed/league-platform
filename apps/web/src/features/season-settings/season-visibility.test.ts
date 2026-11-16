import { describe, expect, it } from 'vitest';
import { isVisibilityWish, statusFor, visibilityOf, wishOf } from './season-visibility.ts';

describe('who can see a season', () => {
  it('reads draft as hidden, active as shown and completed as over', () => {
    expect(visibilityOf('draft')).toBe('hidden');
    expect(visibilityOf('active')).toBe('shown');
    expect(visibilityOf('completed')).toBe('over');
  });

  it('shows a draft season as active and hides an active one back to draft', () => {
    expect(statusFor('draft', 'show')).toBe('active');
    expect(statusFor('active', 'hide')).toBe('draft');
  });

  it('changes nothing that does not fit, and never touches a completed season', () => {
    expect(statusFor('active', 'show')).toBeUndefined();
    expect(statusFor('draft', 'hide')).toBeUndefined();
    expect(statusFor('completed', 'show')).toBeUndefined();
    expect(statusFor('completed', 'hide')).toBeUndefined();
  });

  it('offers one wish for each state, none for a season that is over', () => {
    expect(wishOf('draft')).toBe('show');
    expect(wishOf('active')).toBe('hide');
    expect(wishOf('completed')).toBeUndefined();
  });

  it('knows only the two wishes', () => {
    expect(isVisibilityWish('show')).toBe(true);
    expect(isVisibilityWish('hide')).toBe(true);
    expect(isVisibilityWish('archive')).toBe(false);
    expect(isVisibilityWish(undefined)).toBe(false);
  });
});
