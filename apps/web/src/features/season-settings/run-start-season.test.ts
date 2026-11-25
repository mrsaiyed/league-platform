// "Start the season" through the action's own work (step 2.130), on the made-up world:
// the season lands in the program the form names (the one the admin is working in), never
// silently in the league's default one; the database test covers the copying.
import { startSeason } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { standInLeagues, standInPeople } from '../../server/stand-in-cast.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
import { refusedBy } from './answer.ts';
import { runStartSeason } from './run-start-season.ts';

const owner = {
  leagueId: standInLeagues.live.id,
  accountId: standInPeople.owner.accountId,
  requestId: 'r1',
};
const fields = (programId: string) => ({
  league: 'ignored-the-session-decides',
  programId,
  name: 'Summer 2027',
  slug: 'summer-2027',
  carry: 'teams',
});

describe('runStartSeason', () => {
  it('starts the season in the program the form names: one that is not there is refused', async () => {
    const world = testWorld();
    const missing = '00000000-0000-4000-8000-0000000000ff';
    expect(await runStartSeason(owner, fields(missing), world.deps)).toEqual({
      answer: refusedBy(startSeason.commandName, 'program-not-found'),
      seasonSlug: undefined,
    });
  });

  describe('the game rules asked (S-106, step 2.245)', () => {
    const asked = (clockMode: string, mercyLead: string) => ({
      league: 'ignored-the-session-decides',
      name: 'Summer 2027',
      slug: 'summer-2027',
      carry: 'nothing',
      clockMode,
      mercyLead,
    });

    it('starts a season with a stop clock and a mercy lead', async () => {
      const world = testWorld();
      expect(await runStartSeason(owner, asked('stop', ' 15 '), world.deps)).toMatchObject({
        answer: { kind: 'done' },
        seasonSlug: 'summer-2027',
      });
    });

    it('refuses a mercy lead with a running clock, or one that is not a number', async () => {
      for (const [clock, lead] of [
        ['running', '15'],
        ['stop', 'ten'],
        ['stop', '0'],
      ] as const) {
        const world = testWorld();
        expect(await runStartSeason(owner, asked(clock, lead), world.deps)).toEqual({
          answer: refusedBy(startSeason.commandName, 'game-rule-refused'),
          seasonSlug: undefined,
        });
      }
    });
  });
});
