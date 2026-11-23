import { describe, expect, it } from 'vitest';
import { memoryLeagues } from '../memory-leagues.test-helper.ts';
import { readPublishChecks } from './read-publish-checks.ts';

const read = (made: ReturnType<typeof memoryLeagues>) =>
  made.deps.transaction(made.as(null), (tx) => readPublishChecks(tx));

describe('readPublishChecks', () => {
  it("reads a youth league's contact email and whether its names were chosen", async () => {
    expect(await read(memoryLeagues())).toEqual([
      { key: 'contactEmail', met: true },
      { key: 'privacyChosen', met: false },
    ]);
  });

  it('counts "Names on public pages" saved at the league as chosen', async () => {
    const made = memoryLeagues({
      contactEmail: null,
      settings: [
        {
          place: { level: 'league' },
          key: 'privacy.publicNames',
          document: { version: 1, value: 'fullName' },
          version: 1,
        },
      ],
    });
    expect(await read(made)).toEqual([
      { key: 'contactEmail', met: false },
      { key: 'privacyChosen', met: true },
    ]);
  });
});
