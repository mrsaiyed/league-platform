// "Start the season" through the action's own work (step 2.130), on the made-up world:
// the season lands in the program the form names (the one the admin is working in), never
// silently in the league's default one; the database test covers the copying.
import { describe, expect, it } from 'vitest';
import { standInLeagues, standInPeople } from '../../server/stand-in-cast.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
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
      kind: 'refused',
      code: 'program-not-found',
      field: undefined,
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
        kind: 'started',
        seasonSlug: 'summer-2027',
      });
    });

    it('refuses a mercy lead with a running clock, or one that is not a number, at the mercy box', async () => {
      // Review L2: a stop clock's refusal is about the number; a running clock's, the clock.
      for (const [clock, lead, code] of [
        ['running', '15', 'game-rule-refused'],
        ['stop', 'ten', 'mercy-lead-number'],
        ['stop', '0', 'mercy-lead-number'],
        ['stop', '101', 'mercy-lead-number'],
        ['running', '12.5', 'mercy-lead-number'],
      ] as const) {
        const world = testWorld();
        expect(await runStartSeason(owner, asked(clock, lead), world.deps)).toEqual({
          kind: 'refused',
          code,
          field: 'mercyLead',
        });
      }
    });

    it('refuses an unknown clock word at the clock box, as the command does (review L1)', async () => {
      const world = testWorld();
      expect(await runStartSeason(owner, asked('fast', ''), world.deps)).toEqual({
        kind: 'refused',
        code: 'invalid-input',
        field: 'clockMode',
      });
    });

    it('takes when team fouls start again as one of the settings’ choices; another word is refused at its box', async () => {
      for (const teamFoulsReset of ['half', 'game', 'period']) {
        const world = testWorld();
        expect(
          await runStartSeason(owner, { ...asked('running', ''), teamFoulsReset }, world.deps),
        ).toMatchObject({ kind: 'started' });
      }
      const world = testWorld();
      expect(
        await runStartSeason(
          owner,
          { ...asked('running', ''), teamFoulsReset: 'quarter' },
          world.deps,
        ),
      ).toEqual({ kind: 'refused', code: 'invalid-input', field: 'teamFoulsReset' });
    });
  });

  // Step 2.245: a refusal names the box it is about, so the form marks it and keeps the rest.
  describe('a refusal names its box', () => {
    const typedForm = (more: Readonly<Record<string, string>>) => ({
      league: 'ignored-the-session-decides',
      name: 'Summer 2027',
      slug: 'summer-2027',
      carry: 'nothing',
      ...more,
    });

    it('the name, the short name, the last day and the teams', async () => {
      for (const [more, code, field] of [
        [{ name: '  ' }, 'invalid-input', 'name'],
        [{ slug: 'Summer 2027' }, 'invalid-input', 'slug'],
        [{ startsOn: '2027-06-01', endsOn: '2027-05-01' }, 'invalid-input', 'endsOn'],
        [{ startsOn: 'June' }, 'invalid-input', 'startsOn'],
        [{ carry: 'everything' }, 'invalid-input', 'carry'],
      ] as const) {
        const world = testWorld();
        expect(await runStartSeason(owner, typedForm(more), world.deps)).toEqual({
          kind: 'refused',
          code,
          field,
        });
      }
    });

    it('a short name another season uses', async () => {
      const world = testWorld();
      expect(await runStartSeason(owner, typedForm({}), world.deps)).toMatchObject({
        kind: 'started',
      });
      expect(await runStartSeason(owner, typedForm({}), world.deps)).toEqual({
        kind: 'refused',
        code: 'season-slug-taken',
        field: 'slug',
      });
    });
  });
});
