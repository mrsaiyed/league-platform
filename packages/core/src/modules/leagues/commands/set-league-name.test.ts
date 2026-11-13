// setLeagueName on a stand-in store; the same command against the real database is
// tested in packages/database/src/stores and run by the two-league harness.
import { describe, expect, it } from 'vitest';
import { onEvent } from '../../../command/index.ts';
import {
  memoryDatabase,
  memoryTransaction,
  testDeps,
} from '../../../command/testing/memory-transaction.ts';
import { leagueNameChanged, type LeagueNameChanged } from '../events.ts';
import type { LeagueRecord, LeaguesTx } from '../ports.ts';
import { setLeagueName } from './set-league-name.ts';

const leagueId = '01900000-0000-7000-8000-000000000001';
const owner = { leagueId, accountId: 'owner', requestId: 'request-1' };

function setUp() {
  const db = memoryDatabase<LeagueRecord>({
    id: leagueId,
    name: 'Old name',
    ownerAccountId: 'owner',
    version: 3,
  });
  const transaction = memoryTransaction(
    db,
    (league, jobs): LeaguesTx => ({
      jobs,
      leagues: {
        currentLeague: async () => ({ ...league }),
        setName: async (name, version) => {
          if (league.version !== version) return undefined;
          Object.assign(league, { name, version: version + 1 });
          return league.version;
        },
      },
    }),
  );
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
    expect(db.state).toMatchObject({ name: 'New name', version: 4 });
    expect(announced).toEqual([leagueId]);
  });

  it('refuses a save started from an older version (T-46)', async () => {
    const { db, deps } = setUp();
    expect(await setLeagueName(owner, { name: 'New name', version: 2 }, deps)).toEqual({
      ok: false,
      error: { code: 'changed-since-read' },
    });
    expect(db.state.name).toBe('Old name');
  });

  it('changes nothing and announces nothing when the name is the same', async () => {
    const { deps, announced } = setUp();
    expect(await setLeagueName(owner, { name: 'Old name', version: 3 }, deps)).toMatchObject({
      value: { name: 'Old name', version: 3 },
    });
    expect(announced).toEqual([]);
  });

  it('lets only the owner set it, until roles exist (step 1.12)', async () => {
    const { db, deps } = setUp();
    for (const accountId of ['someone-else', null]) {
      const result = await setLeagueName({ ...owner, accountId }, { name: 'X', version: 3 }, deps);
      expect(result).toEqual({ ok: false, error: { code: 'not-allowed' } });
    }
    const otherLeague = { ...owner, leagueId: '01900000-0000-7000-8000-000000000002' };
    expect(await setLeagueName(otherLeague, { name: 'X', version: 3 }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(db.state.name).toBe('Old name');
  });

  it('refuses an empty or over-long name', async () => {
    const { deps } = setUp();
    for (const name of ['   ', 'x'.repeat(121)]) {
      expect(await setLeagueName(owner, { name, version: 3 }, deps)).toMatchObject({
        error: { code: 'invalid-input' },
      });
    }
  });
});
