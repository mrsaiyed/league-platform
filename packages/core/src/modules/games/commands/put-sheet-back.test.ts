// "Put the sheet back as it was" on a box score that was scored live since its reopen
// (step 2.229, fix round, the review's Medium 1): a reopened box score is scheduled, so a
// scorekeeper may open a scoring session on it and end it with plays. The plays stay, so
// writing the old lines over them would leave a sheet that disagrees with the game's own
// plays: it is refused, and not offered.
import { describe, expect, it } from 'vitest';
import {
  awayTeamId,
  game,
  homeTeamId,
  schedulerId,
  scorekeeperId,
} from '../memory-games.test-helper.ts';
import {
  awayIds,
  endedOnTablet,
  gameId,
  homeIds,
  setUp,
  versionOf,
} from '../reopen-game.test-helper.ts';
import { openScoringSession } from './open-scoring-session.ts';
import { putSheetBack } from './put-sheet-back.ts';
import { readSheetPutBackOffer } from './read-sheet-put-back-offer.ts';
import { reopenGame } from './reopen-game.ts';

const line = (teamId: string, personId: string | undefined, points: number) => ({
  gameId,
  teamId,
  personId: personId ?? '',
  jerseyNumber: null,
  played: true,
  secondsPlayed: null,
  stats: { points },
});

const reason = 'Saved the wrong thing';

describe('put the sheet back after the game was scored live (step 2.229)', () => {
  it('is refused, and not offered, once the reopened game was scored live', async () => {
    const t = setUp({
      games: [game(1, { status: 'final', captureMode: 'box', homeScore: 30, awayScore: 20 })],
      sessions: [],
      liveLines: [line(homeTeamId, homeIds[0], 30), line(awayTeamId, awayIds[0], 20)],
    });
    expect(
      await reopenGame(t.as(schedulerId), { gameId, version: versionOf(t), reason }, t.deps),
    ).toMatchObject({ ok: true });
    expect(t.db.state.corrections[0]?.before.sheet?.lines).toHaveLength(2);
    expect(
      await openScoringSession(t.as(scorekeeperId), { gameId, deviceId: 'tablet' }, t.deps),
    ).toMatchObject({ ok: true });
    await endedOnTablet(t);
    expect(t.db.state.games[0]).toMatchObject({ status: 'final', homeScore: 5, awayScore: 2 });

    expect(await readSheetPutBackOffer(t.as(schedulerId), { gameId }, t.deps)).toEqual({
      ok: true,
      value: { offered: false, code: 'scored-live' },
    });
    const seen = structuredClone(t.db.state.games[0]);
    expect(
      await putSheetBack(t.as(schedulerId), { gameId, version: versionOf(t), reason }, t.deps),
    ).toEqual({ ok: false, error: { code: 'scored-live' } });
    expect(t.db.state.games[0]).toEqual(seen);
    expect(t.db.state.corrections).toHaveLength(1);
  });
});
