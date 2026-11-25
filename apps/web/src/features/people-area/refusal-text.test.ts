import { describe, expect, it } from 'vitest';
import { t } from '../../server/messages.ts';
import { notPutBackText, peopleRefusalText } from './refusal-text.ts';

describe('the sentence a refused People form says', () => {
  it('names who was not removed', () => {
    const said = peopleRefusalText('remove_person', 'not-confirmed', 'Ada Lovell');
    expect(said.startsWith('Not removed: Ada Lovell. ')).toBe(true);
    expect(said).not.toContain('{');
  });

  it('says "Not removed." when the name could not be read, and never "Not saved"', () => {
    const said = peopleRefusalText('remove_person', 'person-on-roster');
    expect(said.startsWith('Not removed. ')).toBe(true);
    expect(peopleRefusalText('remove_person', 'no-such-code', '')).toMatch(/^Not removed\. /);
  });

  it('keeps "Not saved." for a save, with the command\'s own words or the general ones', () => {
    expect(peopleRefusalText('update_person', 'invalid-input').startsWith('Not saved. ')).toBe(
      true,
    );
    expect(peopleRefusalText('update_person', 'no-such-code')).not.toContain('{');
  });

  // No browser test makes "Put them back" refuse: putting back someone already back is
  // answered as done, and the two refusals (their sign-in taken by another person, or
  // they are gone from the bin) cannot be made from the screens (step 2.155 part 5).
  it('names who was not put back, with why', () => {
    expect(notPutBackText('notPutBack.person-profile-taken', 'Ada Lovell')).toBe(
      `Not put back: Ada Lovell. ${t('error.leagues.restore_person.person-profile-taken')}`,
    );
    expect(notPutBackText('notPutBack.person-not-found', 'Ada Lovell')).toBe(
      `Not put back: Ada Lovell. ${t('error.leagues.restore_person.person-not-found')}`,
    );
  });

  it('says "Not put back." when the bin no longer lists them, and nothing for other notices', () => {
    expect(notPutBackText('notPutBack.person-not-found', undefined)).toBe(
      `Not put back. ${t('error.leagues.restore_person.person-not-found')}`,
    );
    expect(notPutBackText('notPutBack.person-not-found', '')).toBe(
      `Not put back. ${t('error.leagues.restore_person.person-not-found')}`,
    );
    expect(notPutBackText('removed', 'Ada Lovell')).toBeUndefined();
  });
});
