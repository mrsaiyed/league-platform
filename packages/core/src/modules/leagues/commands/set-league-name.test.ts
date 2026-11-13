// setLeagueName on a stand-in store; the same command against the real database is
// tested in packages/database/src/stores and run by the two-league harness.
import { describe, expect, it } from 'vitest';
import { onEvent } from '../../../command/index.ts';
import { testDeps } from '../../../command/testing/memory-transaction.ts';
import { leagueNameChanged, type LeagueNameChanged } from '../events.ts';
import { leagueId, memoryLeagues, ownerId } from '../memory-leagues.test-helper.ts';
import type { LeaguesTx } from '../ports.ts';
import { setLeagueName } from './set-league-name.ts';

const owner = { leagueId, accountId: ownerId, requestId: 'request-1' };

function setUp() {
  const { db, transaction, as } = memoryLeagues();
  as(ownerId);
  const announced: string[] = [];
  const listener = onEvent<LeagueNameChanged, LeaguesTx>(leagueNameChanged, async (event) => {
    announced.push(event.leagueId);
  });
  return { db, deps: testDeps(transaction, [listener]), announced };
}

describe('setLeagueName', () => {
  it("sets the league's name, trimmed, and announces it", async () => {
    const { db, deps, announced } = setUp();
    expect(await setLeagueName(owner, { name: '  New name ', version: 3 }, deps)).toEqual({
      ok: true,
      value: { name: 'New name', version: 4 },
    });
    expect(db.state.league).toMatchObject({ name: 'New name', version: 4 });
    expect(announced).toEqual([leagueId]);
  });

  it('refuses a save started from an older version (T-46)', async () => {
    const { db, deps } = setUp();
    expect(await setLeagueName(owner, { name: 'New name', version: 2 }, deps)).toEqual({
      ok: false,
      error: { code: 'changed-since-read' },
    });
    expect(db.state.league?.name).toBe('Old name');
  });

  it('changes nothing and announces nothing when the name is the same', async () => {
    const { deps, announced } = setUp();
    expect(await setLeagueName(owner, { name: 'Old name', version: 3 }, deps)).toMatchObject({
      value: { name: 'Old name', version: 3 },
    });
    expect(announced).toEqual([]);
  });

  it('records who set it in the activity log (A-6)', async () => {
    const { db, deps } = setUp();
    await setLeagueName(owner, { name: 'New name', version: 3 }, deps);
    expect(db.state.activity).toEqual([
      {
        actorAccountId: ownerId,
        action: 'leagues.set_name',
        targetType: 'league',
        targetId: leagueId,
        summary: 'activity.leagues.set_name',
        details: {},
      },
    ]);
  });

  it('lets the owner and admins set it, and no other role (P4 §4)', async () => {
    const admin = '01900000-0000-7000-8000-0000000000a2';
    const editor = '01900000-0000-7000-8000-0000000000a3';
    const grant = (accountId: string, role: 'admin' | 'editor') => ({
      id: `grant-${role}`,
      accountId,
      role,
      scope: { type: 'league' } as const,
      grantedByAccountId: ownerId,
      revokedAt: null,
    });
    const { db, deps } = setUp();
    db.state.grants = [grant(admin, 'admin'), grant(editor, 'editor')];
    expect(
      await setLeagueName({ ...owner, accountId: editor }, { name: 'X', version: 3 }, deps),
    ).toMatchObject({ error: { code: 'not-allowed' } });
    expect(
      await setLeagueName({ ...owner, accountId: admin }, { name: 'X', version: 3 }, deps),
    ).toMatchObject({ ok: true });
  });

  it('refuses anyone with no role, a visitor, and another league', async () => {
    const { db, deps } = setUp();
    for (const accountId of ['someone-else', null]) {
      const result = await setLeagueName({ ...owner, accountId }, { name: 'X', version: 3 }, deps);
      expect(result).toEqual({ ok: false, error: { code: 'not-allowed' } });
    }
    const otherLeague = { ...owner, leagueId: '01900000-0000-7000-8000-000000000002' };
    expect(await setLeagueName(otherLeague, { name: 'X', version: 3 }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(db.state.league?.name).toBe('Old name');
  });

  it('refuses an empty or over-long name', async () => {
    const { deps } = setUp();
    for (const name of ['   ', 'x'.repeat(121)]) {
      expect(await setLeagueName(owner, { name, version: 3 }, deps)).toMatchObject({
        error: { code: 'invalid-input' },
      });
    }
  });

  it('refuses while the league is archived or suspended, which are read-only (U-9)', async () => {
    for (const status of ['archived', 'suspended'] as const) {
      const { db, deps } = setUp();
      if (db.state.league !== undefined) db.state.league = { ...db.state.league, status };
      expect(await setLeagueName(owner, { name: 'Nope', version: 3 }, deps)).toMatchObject({
        error: { code: 'not-allowed' },
      });
    }
  });
});
