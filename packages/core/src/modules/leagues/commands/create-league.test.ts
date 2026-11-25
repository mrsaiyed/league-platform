// createLeague on a stand-in store; the database's own rules are tested in packages/database.
import {
  defaultSeasonRules,
  foulsWithReset,
  startingDesignWith,
  type SeasonRules,
} from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { leagueId, memoryLeagues, ownerId, staffId } from '../memory-leagues.test-helper.ts';
import { createLeague } from './create-league.ts';

const input = {
  slug: 'north-hoops',
  name: '  North Hoops ',
  timeZone: 'America/Chicago',
  audience: 'adult',
  ownerAccountId: ownerId,
  sportKey: 'basketball',
};
const none = { league: undefined, programs: [] };

describe('createLeague', () => {
  it('creates a draft league with its default program', async () => {
    const { db, deps, as } = memoryLeagues(none);
    const result = await createLeague(as(staffId), input, deps);
    expect(result).toMatchObject({
      ok: true,
      value: {
        id: leagueId,
        slug: 'north-hoops',
        name: 'North Hoops',
        status: 'draft',
        version: 1,
      },
    });
    expect(db.state.programs).toMatchObject([{ slug: 'main', isDefault: true }]);
  });

  it('refuses anyone who is not our staff, and nobody signed in', async () => {
    for (const account of [ownerId, null]) {
      const { db, deps, as } = memoryLeagues(none);
      expect(await createLeague(as(account), input, deps)).toEqual({
        ok: false,
        error: { code: 'not-allowed' },
      });
      expect(db.state.league).toBeUndefined();
    }
  });

  it('refuses a blocked short name, a taken one, and a league id already in use (U-7)', async () => {
    const { deps, as } = memoryLeagues(none);
    expect(await createLeague(as(staffId), { ...input, slug: 'admin' }, deps)).toMatchObject({
      error: { code: 'short-name-blocked' },
    });
    expect(await createLeague(as(staffId), { ...input, slug: 'taken-name' }, deps)).toMatchObject({
      error: { code: 'short-name-taken' },
    });
    const existing = memoryLeagues();
    expect(await createLeague(existing.as(staffId), input, existing.deps)).toMatchObject({
      error: { code: 'league-exists' },
    });
  });

  it('refuses short names that break the format, and bad time zones and audiences', async () => {
    const { deps, as } = memoryLeagues(none);
    const bad = [
      { slug: 'ab' },
      { slug: 'x'.repeat(41) },
      { slug: 'Upper-Case' },
      { slug: 'has_underscore' },
      { timeZone: 'Mars/Base' },
      // An offset is read with the opposite sign by PostgreSQL; an abbreviation is ambiguous.
      { timeZone: '+05:00' },
      { timeZone: 'Etc/GMT+5' },
      { timeZone: 'EST' },
      { audience: 'everyone' },
      { ownerAccountId: 'not-an-id' },
      { contactEmail: 'not-an-email' },
      { city: '   ' },
      { city: 'x'.repeat(101) },
    ];
    for (const change of bad) {
      expect(await createLeague(as(staffId), { ...input, ...change }, deps)).toMatchObject({
        error: { code: 'invalid-input' },
      });
    }
  });

  it('passes the contact email and city on, trimmed, and empty when left out', async () => {
    const given = memoryLeagues(none);
    await createLeague(
      given.as(staffId),
      { ...input, contactEmail: 'hello@example.test', city: '  Springfield ' },
      given.deps,
    );
    expect(given.db.state.made).toMatchObject({
      contactEmail: 'hello@example.test',
      city: 'Springfield',
    });
    const left = memoryLeagues(none);
    await createLeague(left.as(staffId), input, left.deps);
    expect(left.db.state.made).toMatchObject({ contactEmail: null, city: null });
  });

  it('keeps a named time zone by its canonical name', async () => {
    const { db, deps, as } = memoryLeagues(none);
    await createLeague(as(staffId), { ...input, timeZone: ' america/chicago ' }, deps);
    expect(db.state.made).toMatchObject({ timeZone: 'America/Chicago' });
  });
});

describe('createLeague with its first season', () => {
  const season = { slug: 'fall-2026', name: ' Fall 2026 ', startsOn: '2026-09-01' };

  it('makes the season, as the current one, in the same step, by our staff for the owner', async () => {
    const { db, deps, as } = memoryLeagues(none);
    const result = await createLeague(as(staffId), { ...input, firstSeason: season }, deps);
    expect(result).toMatchObject({ ok: true, value: { id: leagueId, firstSeasonId: 'season-1' } });
    // One transaction for the league and its season.
    expect(db.opened).toHaveLength(1);
    expect(db.state.seasons).toEqual([
      {
        id: 'season-1',
        programId: 'program-new',
        slug: 'fall-2026',
        name: 'Fall 2026',
        startsOn: '2026-09-01',
        endsOn: null,
        isCurrent: true,
      },
    ]);
    // Our staff is named for both, set up for the owner; nothing is under the owner.
    expect(db.state.activity).toEqual([
      expect.objectContaining({
        actorAccountId: staffId,
        action: 'leagues.create',
        targetId: leagueId,
        details: { forOwnerAccountId: ownerId },
      }),
      expect.objectContaining({
        actorAccountId: staffId,
        action: 'leagues.create_season',
        targetId: 'season-1',
        details: { forOwnerAccountId: ownerId, current: true },
      }),
    ]);
  });

  it('makes no season when none is given', async () => {
    const { db, deps, as } = memoryLeagues(none);
    expect(await createLeague(as(staffId), input, deps)).toMatchObject({
      value: { firstSeasonId: null },
    });
    expect(db.state.seasons).toEqual([]);
  });

  it('refuses a season with dates that are not real, or that end before they start', async () => {
    const { db, deps, as } = memoryLeagues(none);
    for (const change of [
      { startsOn: '2026-02-30' },
      { startsOn: '2026/09/01' },
      { startsOn: '2026-09-01', endsOn: '2026-08-31' },
      { slug: 'x'.repeat(61) },
      { slug: 'Fall 2026' },
      { name: '  ' },
    ]) {
      expect(
        await createLeague(as(staffId), { ...input, firstSeason: { ...season, ...change } }, deps),
      ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    }
    expect(db.state.league).toBeUndefined();
  });

  it('makes nothing at all when the season cannot be made', async () => {
    // A season the store already holds in the new program: the season step throws.
    const { db, deps, as } = memoryLeagues({
      ...none,
      seasons: [{ id: 'season-0', programId: 'program-new', slug: 'fall-2026', isCurrent: false }],
    });
    await expect(
      createLeague(as(staffId), { ...input, firstSeason: season }, deps),
    ).rejects.toThrow(/season with that short name/);
    expect(db.state.league).toBeUndefined();
    expect(db.state.activity).toEqual([]);
  });

  it('gives the league its first site release from the starting design given (step 2.187)', async () => {
    const { db, deps, as } = memoryLeagues(none);
    const design = { startingDesign: 'midnight-gold', colors: { primary: '#123456' } } as const;
    expect(await createLeague(as(staffId), { ...input, design }, deps)).toMatchObject({
      ok: true,
    });
    const made = startingDesignWith('midnight-gold', { primary: '#123456' });
    expect(db.state.siteReleases).toMatchObject([
      { number: 1, startingDesign: 'midnight-gold', design: made, publishedByAccountId: staffId },
    ]);
    expect(db.state.site).toMatchObject({ startingDesign: 'midnight-gold', designDraft: made });
    // One entry, as before, naming the design: no other entry for it.
    expect(db.state.activity).toMatchObject([
      {
        action: 'leagues.create',
        details: { forOwnerAccountId: ownerId, startingDesign: 'midnight-gold' },
      },
    ]);
  });

  it('gives no release when no design is given', async () => {
    const { db, deps, as } = memoryLeagues(none);
    await createLeague(as(staffId), input, deps);
    expect(db.state.siteReleases).toEqual([]);
    expect(db.state.site).toBeUndefined();
  });

  it('refuses a starting design that is not one, or a color that is not #rrggbb, making nothing', async () => {
    for (const design of [
      { startingDesign: 'no-such-design' },
      { startingDesign: 'crest', colors: { primary: 'red; } body { display:none' } },
      { startingDesign: 'crest', colors: { accent: '</style><script>' } },
      { startingDesign: 'crest', colors: { highlight: 'url(http://example.test)' } },
      { startingDesign: 'crest', colors: { background: '#000000' } },
    ]) {
      const { db, deps, as } = memoryLeagues(none);
      expect(await createLeague(as(staffId), { ...input, design }, deps)).toMatchObject({
        error: { code: 'invalid-input' },
      });
      expect(db.state.league).toBeUndefined();
      expect(db.state.siteReleases).toEqual([]);
    }
  });

  it('makes nothing at all when the first release cannot be written', async () => {
    const { db, deps, as } = memoryLeagues({ ...none, takenReleaseNumbers: [1] });
    await expect(
      createLeague(as(staffId), { ...input, design: { startingDesign: 'crest' } }, deps),
    ).rejects.toThrow(/already had a site release/);
    expect(db.state.league).toBeUndefined();
  });
});

describe('createLeague with the game rules asked (S-106, step 2.245)', () => {
  const season = { slug: 'fall-2026', name: 'Fall 2026' };
  const savedRules = (db: ReturnType<typeof memoryLeagues>['db']) =>
    db.state.seasons.find((s) => s.slug === 'fall-2026')?.rules as SeasonRules | undefined;

  it('saves the first season with a stop clock and a mercy lead', async () => {
    const { db, deps, as } = memoryLeagues(none);
    const firstSeason = { ...season, gameRules: { clockMode: 'stop', mercyLead: 20 } } as const;
    expect(await createLeague(as(staffId), { ...input, firstSeason }, deps)).toMatchObject({
      ok: true,
    });
    expect(savedRules(db)).toEqual({
      ...defaultSeasonRules(),
      clock: { mode: 'stop', stopClockLastSeconds: null, mercyLead: 20 },
    });
  });

  it('saves team fouls that start again each half as the settings do, marked (T-422)', async () => {
    const { db, deps, as } = memoryLeagues(none);
    const firstSeason = { ...season, gameRules: { teamFoulsReset: 'half' } } as const;
    await createLeague(as(staffId), { ...input, firstSeason }, deps);
    const rules = savedRules(db);
    expect(rules?.fouls).toEqual(foulsWithReset(defaultSeasonRules().fouls, 'half'));
    expect(rules?.fouls.teamFoulsResetChosen).toBe(true);
  });

  it('saves the defaults for answers left untouched', async () => {
    const { db, deps, as } = memoryLeagues(none);
    const firstSeason = { ...season, gameRules: {} };
    expect(await createLeague(as(staffId), { ...input, firstSeason }, deps)).toMatchObject({
      ok: true,
    });
    expect(savedRules(db)).toEqual(defaultSeasonRules());
    expect(savedRules(db)?.fouls.teamFoulsResetChosen).toBeUndefined();
  });

  it('saves no rules when the questions are not given, as before', async () => {
    const { db, deps, as } = memoryLeagues(none);
    await createLeague(as(staffId), { ...input, firstSeason: season }, deps);
    expect(savedRules(db)).toBeUndefined();
  });

  it('refuses a pair the settings refuse, naming the question, and makes nothing', async () => {
    const { db, deps, as } = memoryLeagues(none);
    for (const gameRules of [{ clockMode: 'running', mercyLead: 20 }, { mercyLead: 0 }] as const) {
      expect(
        await createLeague(as(staffId), { ...input, firstSeason: { ...season, gameRules } }, deps),
      ).toEqual({ ok: false, error: { code: 'game-rule-refused', question: 'mercyLead' } });
    }
    expect(db.state.league).toBeUndefined();
  });

  it('refuses an answer of the wrong kind as input', async () => {
    const { deps, as } = memoryLeagues(none);
    for (const gameRules of [{ clockMode: 'sometimes' }, { mercyLead: 2.5 }]) {
      expect(
        await createLeague(as(staffId), { ...input, firstSeason: { ...season, gameRules } }, deps),
      ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    }
  });
});
