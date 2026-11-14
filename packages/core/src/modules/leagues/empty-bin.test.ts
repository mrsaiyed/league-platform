import { describe, expect, it } from 'vitest';
import { emptyBin } from './empty-bin.ts';
import { leagueId, memoryBin, teamId } from './memory-bin.test-helper.ts';

const day = 24 * 60 * 60 * 1000;
const t0 = Date.parse('2026-03-01T00:00:00.000Z');
const ago = (days: number) => new Date(t0 - days * day).toISOString();
const context = { leagueId, accountId: null, requestId: 'job-1' };

describe('emptyBin', () => {
  it('removes only what is 30 days old or older, by the clock it is given', async () => {
    const { db, deps } = memoryBin({
      things: [
        { id: teamId(1), kind: 'team', name: 'Old', binnedAt: ago(31) },
        { id: teamId(2), kind: 'team', name: 'Exactly', binnedAt: ago(30) },
        { id: teamId(3), kind: 'team', name: 'Young', binnedAt: ago(29) },
        { id: teamId(4), kind: 'person', name: 'Live', binnedAt: null },
        { id: teamId(5), kind: 'venue', name: 'Held', binnedAt: ago(90), referenced: true },
      ],
    });
    const counts = await deps.transaction(context, (tx) => emptyBin(tx, context, new Date(t0)));
    expect(counts).toMatchObject({ teams: 2, people: 0, venues: 0 });
    expect(db.state.things.map((t) => t.name)).toEqual(['Young', 'Live', 'Held']);
    expect(db.state.activity.map((a) => a.action)).toEqual(['leagues.empty_bin']);
    // A second run changes nothing (T-137).
    const again = await deps.transaction(context, (tx) => emptyBin(tx, context, new Date(t0)));
    expect(again.teams).toBe(0);
    expect(db.state.activity).toHaveLength(1);
  });
});
