// The seed leagues (T-195) name a starting design by its key; the key must be a real one,
// or a loaded league would fall back to the neutral look without anyone noticing.
import { seedLeagues } from '@srleagues/database';
import { startingDesignKeys } from '@srleagues/site';
import { describe, expect, it } from 'vitest';

describe('seed league designs', () => {
  it('are all starting designs the site package has', () => {
    for (const league of seedLeagues) {
      expect(startingDesignKeys as readonly string[]).toContain(league.design);
    }
  });
});
