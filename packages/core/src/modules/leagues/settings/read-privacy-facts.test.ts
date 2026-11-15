import { describe, expect, it } from 'vitest';
import { memoryLeagues, ownerId } from '../memory-leagues.test-helper.ts';
import { readPrivacyFacts } from './read-privacy-facts.ts';

describe('readPrivacyFacts (record 065)', () => {
  it('says who plays in the league and whether anyone is recorded as a child', async () => {
    for (const audience of ['adult', 'youth', 'mixed'] as const) {
      for (const recordedChild of [false, true]) {
        const m = memoryLeagues({ audience, recordedChild });
        expect(await m.deps.transaction(m.as(ownerId), (tx) => readPrivacyFacts(tx))).toEqual({
          audience,
          hasRecordedChild: recordedChild,
        });
      }
    }
  });
});
