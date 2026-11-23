import { describe, expect, it } from 'vitest';
import {
  adminOfOtherProgramId,
  game,
  memoryStandings,
  otherProgramAdminGrant,
  ownerId,
  seasonId,
  teamId,
} from '../memory-standings.test-helper.ts';
import { addAdjustment } from './add-adjustment.ts';
import { listAdjustments } from './list-adjustments.ts';

const decided = game(1, 1, 2, {
  status: 'final',
  homeScore: 60,
  awayScore: 50,
  finalizedAt: '2026-12-20T20:00:00.000Z',
});

describe('listAdjustments', () => {
  it("gives the season's adjustments with their reasons and ids, and its teams", async () => {
    const { deps, as } = memoryStandings({ games: [decided] });
    const added = await addAdjustment(
      as(ownerId),
      { seasonId, teamId: teamId(2), wins: 1, losses: -1, reason: 'Ruling: protest upheld' },
      deps,
    );
    const listed = await listAdjustments(as(ownerId), { seasonId }, deps);
    expect(listed.ok && listed.value.adjustments).toEqual([
      expect.objectContaining({
        id: added.ok ? added.value.adjustmentId : '',
        teamId: teamId(2),
        reason: 'Ruling: protest upheld',
      }),
    ]);
    expect(listed.ok && listed.value.teams.map((t) => t.teamId)).toContain(teamId(2));
  });

  it("refuses someone who may not adjust the season's standings", async () => {
    const { deps, as } = memoryStandings({
      games: [decided],
      grants: [otherProgramAdminGrant],
    });
    expect(await listAdjustments(as(adminOfOtherProgramId), { seasonId }, deps)).toMatchObject({
      ok: false,
      error: { code: 'not-allowed' },
    });
  });
});
