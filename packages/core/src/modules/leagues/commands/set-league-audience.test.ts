// setLeagueAudience on a stand-in store; against the real database it is run by the role
// matrix and the two-league harness.
import { describe, expect, it } from 'vitest';
import { testDeps } from '../../../command/testing/memory-transaction.ts';
import type { Audience } from '../league-values.ts';
import { leagueId, memoryLeagues, ownerId } from '../memory-leagues.test-helper.ts';
import { setLeagueAudience } from './set-league-audience.ts';

const owner = { leagueId, accountId: ownerId, requestId: 'request-1' };
const key = 'privacy.childrenInFullConfirmed';

function setUp(audience: Audience, childrenInFull = false) {
  const { db, transaction, as } = memoryLeagues({ audience });
  as(ownerId);
  if (childrenInFull) {
    db.state.settings.push({
      place: { level: 'league' },
      key,
      document: { version: 1, value: true },
      version: 2,
    });
  }
  return { db, deps: testDeps(transaction) };
}

describe('setLeagueAudience', () => {
  it('moves toward adults only with the confirmation (R-14), and logs it', async () => {
    const { db, deps } = setUp('youth');
    expect(await setLeagueAudience(owner, { audience: 'adult', version: 3 }, deps)).toEqual({
      ok: false,
      error: { code: 'confirmation-needed' },
    });
    expect(db.state.audience).toBe('youth');
    expect(
      await setLeagueAudience(owner, { audience: 'adult', confirmed: true, version: 3 }, deps),
    ).toEqual({
      ok: true,
      value: { audience: 'adult', version: 4, clearedChildrenInFull: false },
    });
    expect(db.state.audience).toBe('adult');
    expect(db.state.activity).toMatchObject([
      { action: 'leagues.set_audience', details: { audience: 'adult', confirmed: true } },
    ]);
  });

  it('never asks when moving away from adults', async () => {
    const { db, deps } = setUp('adult');
    expect(await setLeagueAudience(owner, { audience: 'youth', version: 3 }, deps)).toMatchObject({
      ok: true,
    });
    expect(db.state.audience).toBe('youth');
  });

  it('clears a confirmed "children in full" when an adult league brings children in', async () => {
    const { db, deps } = setUp('adult', true);
    expect(await setLeagueAudience(owner, { audience: 'mixed', version: 3 }, deps)).toEqual({
      ok: true,
      value: { audience: 'mixed', version: 4, clearedChildrenInFull: true },
    });
    expect(db.state.settings.filter((row) => row.key === key)).toEqual([]);
    // The clearing is logged as a clearing of its own (one writer, record 065).
    expect(db.state.activity).toMatchObject([
      { action: 'leagues.clear_setting', details: { key, level: 'league' } },
      {
        action: 'leagues.set_audience',
        details: { audience: 'mixed', clearedChildrenInFull: true },
      },
    ]);
  });

  it('keeps "children in full" when the league already had children', async () => {
    const { db, deps } = setUp('mixed', true);
    await setLeagueAudience(owner, { audience: 'youth', version: 3 }, deps);
    expect(db.state.settings.filter((row) => row.key === key)).toHaveLength(1);
  });

  it('changes nothing when who plays is the same', async () => {
    const { db, deps } = setUp('youth');
    expect(await setLeagueAudience(owner, { audience: 'youth', version: 3 }, deps)).toEqual({
      ok: true,
      value: { audience: 'youth', version: 3, clearedChildrenInFull: false },
    });
    expect(db.state.activity).toEqual([]);
  });

  it('refuses a save started from an older version (T-46)', async () => {
    const { db, deps } = setUp('adult', true);
    expect(await setLeagueAudience(owner, { audience: 'youth', version: 2 }, deps)).toEqual({
      ok: false,
      error: { code: 'changed-since-read' },
    });
    expect(db.state.settings).toHaveLength(1);
  });

  it('is refused in an archived league, which is read-only (U-9)', async () => {
    const { db, deps } = setUp('adult');
    if (db.state.league !== undefined) db.state.league = { ...db.state.league, status: 'archived' };
    expect(await setLeagueAudience(owner, { audience: 'youth', version: 3 }, deps)).toMatchObject({
      ok: false,
    });
    expect(db.state.audience).toBe('adult');
  });
});
