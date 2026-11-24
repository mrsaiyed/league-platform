import { describe, expect, it } from 'vitest';
import { addAdjustment } from './commands/add-adjustment.ts';
import { rebuildStandings } from './commands/rebuild-standings.ts';
import { recordCoinFlip } from './commands/record-coin-flip.ts';
import { removeAdjustment } from './commands/remove-adjustment.ts';
import { removeCoinFlip } from './commands/remove-coin-flip.ts';
import {
  game,
  memoryStandings,
  ownerId,
  seasonId,
  teamId,
} from './memory-standings.test-helper.ts';

// In an archived season only a correction with a reason changes it (O-12, step 2.130,
// T-387): a standings command that carries a reason passes, a rebuild passes (it changes
// no fact, only recounts), and one given no reason is refused with `season-archived`.
const decided = game(1, 1, 2, {
  status: 'final',
  homeScore: 60,
  awayScore: 50,
  finalizedAt: '2026-12-20T20:00:00.000Z',
});
const archived = () => memoryStandings({ games: [decided], archived: [seasonId] });
const level = [teamId(3), teamId(4)];

describe('standings in an archived season (T-387)', () => {
  it('an adjustment with its reason and a rebuild pass', async () => {
    const { deps, as } = archived();
    const added = await addAdjustment(
      as(ownerId),
      { seasonId, teamId: teamId(2), wins: 1, losses: -1, ties: 0, points: 0, reason: 'Late fee' },
      deps,
    );
    expect(added.ok).toBe(true);
    expect((await rebuildStandings(as(ownerId), { seasonId }, deps)).ok).toBe(true);
  });

  it('a coin flip with no note is refused; with one it passes', async () => {
    const { deps, as } = archived();
    const flip = { seasonId, teamIds: level, method: 'by-hand' } as const;
    expect(await recordCoinFlip(as(ownerId), flip, deps)).toEqual({
      ok: false,
      error: { code: 'season-archived' },
    });
    const noted = await recordCoinFlip(as(ownerId), { ...flip, note: 'Drawn at the AGM' }, deps);
    expect(noted.ok).toBe(true);
    if (!noted.ok) return;
    const flipId = noted.value.flipId;
    expect(await removeCoinFlip(as(ownerId), { seasonId, flipId }, deps)).toEqual({
      ok: false,
      error: { code: 'season-archived' },
    });
    const removed = await removeCoinFlip(
      as(ownerId),
      { seasonId, flipId, reason: 'Redrawn' },
      deps,
    );
    expect(removed.ok).toBe(true);
  });

  it('taking an adjustment off needs a reason there', async () => {
    const { db, deps, as } = archived();
    const added = await addAdjustment(
      as(ownerId),
      { seasonId, teamId: teamId(2), wins: 1, losses: -1, ties: 0, points: 0, reason: 'Late fee' },
      deps,
    );
    if (!added.ok) throw new Error('addAdjustment failed');
    const adjustmentId = db.state.adjustments[0]?.id ?? '';
    expect(await removeAdjustment(as(ownerId), { seasonId, adjustmentId }, deps)).toEqual({
      ok: false,
      error: { code: 'season-archived' },
    });
    const removed = await removeAdjustment(
      as(ownerId),
      { seasonId, adjustmentId, reason: 'Paid after all' },
      deps,
    );
    expect(removed.ok).toBe(true);
  });

  it('a season not archived takes a coin flip with no note', async () => {
    const { deps, as } = memoryStandings({ games: [decided] });
    const flip = { seasonId, teamIds: level, method: 'by-hand' } as const;
    expect((await recordCoinFlip(as(ownerId), flip, deps)).ok).toBe(true);
  });
});
