import { describe, expect, it } from 'vitest';
import { earlierRoundKey, parseEarlierRoundKey } from './earlier-round-key.ts';

const round = '01900000-0000-7000-8000-0000000b0001';
const season = '01900000-0000-7000-8000-0000000000c1';

describe('earlierRoundKey', () => {
  it('names a round by its id and a season with no round by the season', () => {
    expect(earlierRoundKey({ seasonId: season, roundId: round })).toBe(`r-${round}`);
    expect(earlierRoundKey({ seasonId: season, roundId: null })).toBe(`s-${season}`);
  });

  it('reads back what it names, and nothing else', () => {
    expect(parseEarlierRoundKey(`r-${round}`)).toEqual({ roundId: round });
    expect(parseEarlierRoundKey(`s-${season}`)).toEqual({ seasonId: season });
    expect(parseEarlierRoundKey(`R-${round.toUpperCase()}`)).toEqual({ roundId: round });
    for (const wrong of [undefined, '', round, `x-${round}`, `r-${round}x`, 'r-1', `r-${round} `]) {
      expect(parseEarlierRoundKey(wrong), String(wrong)).toBeUndefined();
    }
  });
});
