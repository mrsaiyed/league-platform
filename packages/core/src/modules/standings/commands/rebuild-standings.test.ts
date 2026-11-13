import { describe, expect, it } from 'vitest';
import {
  adminOfOtherProgramId,
  game,
  memoryStandings,
  otherProgramAdminGrant,
  ownerId,
  schedulerGrant,
  schedulerId,
  seasonId,
  teamId,
} from '../memory-standings.test-helper.ts';
import { rebuildStandings } from './rebuild-standings.ts';

const decided = (n: number, home: number, away: number, homeScore: number, awayScore: number) =>
  game(n, home, away, {
    status: 'final',
    homeScore,
    awayScore,
    finalizedAt: '2026-12-20T20:00:00.000Z',
  });

describe('rebuildStandings', () => {
  it('saves every team of the season a row and logs it', async () => {
    const { db, deps, as } = memoryStandings({ games: [decided(1, 1, 2, 60, 50)] });
    expect(await rebuildStandings(as(ownerId), { seasonId }, deps)).toEqual({
      ok: true,
      value: { teams: 4, players: 0, problems: [] },
    });
    expect(db.state.rows[seasonId]?.[0]).toMatchObject({ teamId: teamId(1), wins: 1 });
    expect(db.state.activity).toEqual([
      expect.objectContaining({
        action: 'standings.rebuild_season',
        targetType: 'season',
        targetId: seasonId,
      }),
    ]);
  });

  it('reports what the calculation left out or wants the admin to see', async () => {
    // A level final score in a season without ties counts as a tie and is reported.
    const { deps, as } = memoryStandings({ games: [decided(1, 1, 2, 50, 50)] });
    expect(await rebuildStandings(as(ownerId), { seasonId }, deps)).toMatchObject({
      ok: true,
      value: { problems: [{ kind: 'game', reason: 'tie-not-allowed', leftOut: false }] },
    });
  });

  it('refuses a season that is not here, and bad input', async () => {
    const { deps, as } = memoryStandings();
    expect(await rebuildStandings(as(ownerId), { seasonId: teamId(77) }, deps)).toEqual({
      ok: false,
      error: { code: 'season-not-found' },
    });
    expect(await rebuildStandings(as(ownerId), { seasonId: 'nope' }, deps)).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  });

  it("needs standings.adjust at the season's program, in a league that is not read-only", async () => {
    const allowed = async (account: string, status = 'live') => {
      const { deps, as } = memoryStandings({
        status,
        grants: [schedulerGrant, otherProgramAdminGrant],
      });
      return (await rebuildStandings(as(account), { seasonId }, deps)).ok;
    };
    expect(await allowed(ownerId)).toBe(true);
    // A scheduler scores games but does not hold standings.adjust (P4 §4).
    expect(await allowed(schedulerId)).toBe(false);
    expect(await allowed(adminOfOtherProgramId)).toBe(false);
    expect(await allowed(ownerId, 'archived')).toBe(false);
    expect(await allowed(ownerId, 'suspended')).toBe(false);
  });
});
