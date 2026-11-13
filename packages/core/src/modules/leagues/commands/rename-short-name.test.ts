import { describe, expect, it } from 'vitest';
import { memoryLeagues, ownerId, staffId } from '../memory-leagues.test-helper.ts';
import { renameShortName } from './rename-short-name.ts';

describe('renameShortName', () => {
  it('renames and keeps the old name forwarding for 12 months (U-7)', async () => {
    const { db, deps, as } = memoryLeagues();
    const result = await renameShortName(as(ownerId), { slug: 'new-name', version: 3 }, deps);
    expect(result).toEqual({ ok: true, value: { slug: 'new-name', version: 4 } });
    expect(db.state.forwarding).toEqual([{ slug: 'old-name', months: 12 }]);
  });

  it('refuses blocked, taken and stale, changing nothing', async () => {
    const { db, deps, as } = memoryLeagues();
    const run = (slug: string, version = 3) =>
      renameShortName(as(ownerId), { slug, version }, deps);
    expect(await run('pricing')).toMatchObject({ error: { code: 'short-name-blocked' } });
    expect(await run('taken-name')).toMatchObject({ error: { code: 'short-name-taken' } });
    expect(await run('new-name', 2)).toMatchObject({ error: { code: 'changed-since-read' } });
    expect(await run('BAD')).toMatchObject({ error: { code: 'invalid-input' } });
    expect(db.state.league).toMatchObject({ slug: 'old-name', version: 3 });
    expect(db.state.forwarding).toEqual([]);
  });

  it('does nothing when the name is the same, and is for the owner only', async () => {
    const { db, deps, as } = memoryLeagues();
    const same = await renameShortName(as(ownerId), { slug: 'old-name', version: 3 }, deps);
    expect(same).toMatchObject({ ok: true });
    expect(db.state.forwarding).toEqual([]);
    for (const account of [staffId, null]) {
      expect(await renameShortName(as(account), { slug: 'new-name', version: 3 }, deps)).toEqual({
        ok: false,
        error: { code: 'not-allowed' },
      });
    }
  });
});
