// "Yes" through the action's own work (step 2.182), on the made-up world: a fresh yes
// shows the season; a yes from a question drawn before someone else showed or hid the
// season changes nothing and says so; a yes after any other save in between is refused.
import { getSeason, updateSeason } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { standInLeagues, standInPeople } from '../../server/stand-in-cast.ts';
import { standInSeasonIds } from '../../server/stand-in-world-seed.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
import { runVisibilityChange } from './run-visibility-change.ts';

const leagueId = standInLeagues.live.id;
const owner = { leagueId, accountId: standInPeople.owner.accountId, requestId: 'r1' };
const winter = standInSeasonIds.adultNext;

async function setUp() {
  const world = testWorld();
  const read = async () => {
    const got = await getSeason(owner, { seasonId: winter }, world.deps);
    if (!got.ok) throw new Error(got.error.code);
    return got.value;
  };
  return { world, read };
}

const yes = (wish: string, version: number) => ({
  league: 'ignored-the-session-decides',
  seasonId: winter,
  version: String(version),
  wish,
});

describe('runVisibilityChange', () => {
  it('shows the season on a fresh yes, naming it by its own short name', async () => {
    const { world, read } = await setUp();
    const asked = await read();
    expect(await runVisibilityChange(owner, yes('show', asked.version), world.deps)).toEqual({
      answer: { kind: 'done', done: 'shown' },
      seasonSlug: 'winter-2027',
    });
    expect((await read()).status).toBe('active');
  });

  it('changes nothing when the season was shown since the question was drawn', async () => {
    const { world, read } = await setUp();
    const asked = await read();
    // Another admin shows it while this question is open.
    await updateSeason(
      owner,
      { seasonId: winter, version: asked.version, status: 'active' },
      world.deps,
    );
    const between = await read();
    expect(await runVisibilityChange(owner, yes('show', asked.version), world.deps)).toEqual({
      answer: { kind: 'refused', word: 'not-hidden' },
      seasonSlug: 'winter-2027',
    });
    expect(await read()).toEqual(between);
  });

  it('changes nothing when the season was hidden since the hide question was drawn', async () => {
    const { world, read } = await setUp();
    const first = await read();
    await updateSeason(
      owner,
      { seasonId: winter, version: first.version, status: 'active' },
      world.deps,
    );
    const asked = await read();
    await updateSeason(
      owner,
      { seasonId: winter, version: asked.version, status: 'draft' },
      world.deps,
    );
    const between = await read();
    expect(await runVisibilityChange(owner, yes('hide', asked.version), world.deps)).toEqual({
      answer: { kind: 'refused', word: 'not-shown' },
      seasonSlug: 'winter-2027',
    });
    expect(await read()).toEqual(between);
  });

  it('refuses a yes after another save in between, and changes nothing', async () => {
    const { world, read } = await setUp();
    const asked = await read();
    await updateSeason(
      owner,
      { seasonId: winter, version: asked.version, name: 'Winter 2027 League' },
      world.deps,
    );
    expect(await runVisibilityChange(owner, yes('show', asked.version), world.deps)).toEqual({
      answer: { kind: 'refused', word: 'leagues.update_season.changed-since-read' },
      seasonSlug: 'winter-2027',
    });
    expect((await read()).status).toBe('draft');
  });

  it('refuses a wish it does not know, and a season of no league here', async () => {
    const { world } = await setUp();
    expect((await runVisibilityChange(owner, yes('archive', 1), world.deps)).answer).toEqual({
      kind: 'refused',
      word: 'leagues.update_season.invalid-input',
    });
    const elsewhere = { ...owner, leagueId: standInLeagues.other.id };
    expect(await runVisibilityChange(elsewhere, yes('show', 1), world.deps)).toEqual({
      answer: { kind: 'refused', word: 'leagues.update_season.season-not-found' },
      seasonSlug: undefined,
    });
  });
});
