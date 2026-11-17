// Which address under `[league]` is a local-only page (step 2.96): exactly the two platform
// addresses, as the route's values give them, and nothing else.
import { describe, expect, it } from 'vitest';
import { localToolPageOf } from './local-tool-page.ts';

describe('localToolPageOf', () => {
  it('is the kept emails or "be this made-up person" at their own addresses only', () => {
    expect(localToolPageOf('signin', ['kept-emails'])).toBe('keptEmails');
    expect(localToolPageOf('signin', ['made-up-people'])).toBe('madeUpPeople');
    for (const [league, missing] of [
      ['signin', ['no-such-page']],
      ['signin', ['kept-emails', 'anything.json']],
      ['signin', ['Kept-Emails']],
      ['signin', []],
      ['north-valley', ['kept-emails']],
      ['north-valley', ['made-up-people']],
      ['kept-emails', ['signin']],
    ] as const) {
      expect(localToolPageOf(league, missing), `${league}/${missing.join('/')}`).toBeNull();
    }
  });
});
