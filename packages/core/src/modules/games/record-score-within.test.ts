import { describe, expect, it } from 'vitest';
import type { GameFinalized } from '../../events/game-events.ts';
import {
  emptyGames,
  game,
  gameUuid,
  gamesTxOf,
  leagueId,
  ownerId,
  type MemoryGames,
} from './memory-games.test-helper.ts';
import { recordFinalScoreWithin } from './record-score-within.ts';

const lineOf = (n: number) => ({
  gameId: gameUuid(n),
  teamId: game(n).homeTeamId,
  personId: `01900000-0000-7000-8000-0000000d000${n}`,
  played: true,
  secondsPlayed: null,
  stats: { points: 20 },
});

async function record(state: Partial<MemoryGames>, scores = { homeScore: 52, awayScore: 48 }) {
  const s: MemoryGames = { ...emptyGames(), ...state };
  const tx = gamesTxOf(s, { enqueue: async () => {} });
  const events: GameFinalized[] = [];
  const result = await recordFinalScoreWithin({
    context: { leagueId, accountId: ownerId, requestId: 'request-1' },
    tx,
    emit: (e) => void events.push(e),
    gameId: gameUuid(1),
    ...scores,
    action: 'imports.apply_fixture_import',
  });
  return { s, result, events };
}

describe('recordFinalScoreWithin', () => {
  it('clears the old lines of a box score game finalized with two numbers only', async () => {
    const { s, result } = await record({
      games: [game(1, { captureMode: 'box' }), game(2, { captureMode: 'box' })],
      lines: [lineOf(1), lineOf(2)],
    });
    expect(result).toMatchObject({ ok: true });
    expect(s.games[0]).toMatchObject({ status: 'final', homeScore: 52, captureMode: 'final' });
    expect(s.lines).toEqual([lineOf(2)]);
  });

  it('changes nothing when the score is refused, and leaves other games alone', async () => {
    const refused = await record(
      { games: [game(1, { captureMode: 'box' })], lines: [lineOf(1)] },
      { homeScore: 40, awayScore: 40 },
    );
    expect(refused.result).toMatchObject({ ok: false, error: { code: 'tie-not-allowed' } });
    expect(refused.s.lines).toEqual([lineOf(1)]);

    // A postponed game (step 2.158, S-75): an imported score waits, nothing changes.
    const postponed = await record({
      games: [game(1, { status: 'postponed', captureMode: 'box' })],
      lines: [lineOf(1)],
    });
    expect(postponed.result).toEqual({ ok: false, error: { code: 'game-postponed' } });
    expect(postponed.s.games[0]).toMatchObject({ status: 'postponed', homeScore: null });
    expect(postponed.s.lines).toEqual([lineOf(1)]);
    expect(postponed.events).toEqual([]);

    const live = await record({ games: [game(1, { captureMode: 'live' })], lines: [lineOf(1)] });
    expect(live.result).toMatchObject({ ok: true });
    expect(live.s.games[0]?.captureMode).toBe('live');
    expect(live.s.lines).toEqual([lineOf(1)]);
  });
});
