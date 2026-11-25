import { describe, expect, it } from 'vitest';
import { peopleRefusalText } from './refusal-text.ts';

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
});
