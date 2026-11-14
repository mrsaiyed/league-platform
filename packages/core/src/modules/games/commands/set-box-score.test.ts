import { describe, expect, it } from 'vitest';
import {
  awayTeamId,
  finalGame,
  game,
  gameUuid,
  homeTeamId,
  memoryGames,
  ownerId,
  scorekeeperGrant,
  scorekeeperId,
  seasonId,
  editorGrant,
  editorId,
} from '../memory-games.test-helper.ts';
import type { GameRosterPlayer } from '../ports.ts';
import { setBoxScore } from './set-box-score.ts';

const person = (n: number) => `01900000-0000-7000-8000-0000000d${String(n).padStart(4, '0')}`;
const player = (n: number, teamId: string, fields: Partial<GameRosterPlayer> = {}) => ({
  teamId,
  personId: person(n),
  firstName: `First${n}`,
  lastName: `Last${n}`,
  jerseyNumber: String(n),
  left: false,
  ...fields,
});
const roster = [
  player(1, homeTeamId),
  player(2, homeTeamId, { left: true }),
  player(3, awayTeamId),
];

const line = (n: number, teamId: string, stats: Record<string, number>, played = true) => ({
  teamId,
  personId: person(n),
  played,
  secondsPlayed: played ? 1200 : null,
  stats,
});

const input = {
  gameId: gameUuid(1),
  version: 1,
  homeScore: 30,
  awayScore: 18,
  lines: [
    line(1, homeTeamId, { points: 20, fouls: 2 }),
    // Fouls were not recorded for this player: the key is left out.
    line(2, homeTeamId, { points: 10 }),
    line(3, awayTeamId, { points: 18, fouls: 4 }),
  ],
};

describe('setBoxScore', () => {
  it('saves the lines, finalizes the game as a box score, logs it and announces it', async () => {
    const { db, deps, as, events } = memoryGames({ games: [game(1)], roster });
    expect(await setBoxScore(as(ownerId), input, deps)).toEqual({
      ok: true,
      value: { version: 2 },
    });
    expect(db.state.games[0]).toMatchObject({
      status: 'final',
      captureMode: 'box',
      homeScore: 30,
      awayScore: 18,
    });
    expect(db.state.games[0]?.format).toMatchObject({ version: 1 });
    expect(db.state.lines).toEqual(input.lines.map((l) => ({ gameId: gameUuid(1), ...l })));
    expect(db.state.activity.map((a) => a.action)).toEqual(['games.set_box_score']);
    expect(events).toEqual([
      { type: 'games.finalized', leagueId: expect.any(String), gameId: gameUuid(1), seasonId },
    ]);
  });

  it('replaces lines a reopened game kept, and takes a sheet with no lines', async () => {
    const old = { gameId: gameUuid(1), ...line(1, homeTeamId, { points: 99 }) };
    const { db, deps, as } = memoryGames({ games: [game(1)], roster, lines: [old] });
    expect(await setBoxScore(as(ownerId), { ...input, lines: [] }, deps)).toMatchObject({
      ok: true,
    });
    expect(db.state.lines).toEqual([]);
  });

  it('records a player who did not play with no stats and no minutes', async () => {
    const { db, deps, as } = memoryGames({ games: [game(1)], roster });
    const dnp = line(2, homeTeamId, {}, false);
    expect(await setBoxScore(as(ownerId), { ...input, lines: [dnp] }, deps)).toMatchObject({
      ok: true,
    });
    expect(db.state.lines[0]).toMatchObject({ played: false, secondsPlayed: null, stats: {} });
    const withStats = { ...dnp, stats: { points: 2 } };
    const again = memoryGames({ games: [game(1)], roster });
    expect(
      await setBoxScore(again.as(ownerId), { ...input, lines: [withStats] }, again.deps),
    ).toEqual({ ok: false, error: { code: 'did-not-play-has-stats' } });
  });

  it('refuses a player not on that team, a player twice and a team not in the game', async () => {
    const cases = [
      { lines: [line(3, homeTeamId, { points: 1 })], code: 'player-not-on-team' },
      { lines: [line(9, homeTeamId, { points: 1 })], code: 'player-not-on-team' },
      {
        lines: [line(1, homeTeamId, { points: 1 }), line(1, homeTeamId, { points: 2 })],
        code: 'player-listed-twice',
      },
      {
        lines: [line(1, '01900000-0000-7000-8000-0000000a0009', { points: 1 })],
        code: 'team-not-in-game',
      },
    ];
    for (const { lines, code } of cases) {
      const { db, deps, as } = memoryGames({ games: [game(1)], roster });
      expect(await setBoxScore(as(ownerId), { ...input, lines }, deps)).toEqual({
        ok: false,
        error: { code },
      });
      // Nothing is kept from a refused sheet.
      expect(db.state.lines).toEqual([]);
      expect(db.state.games[0]?.status).toBe('scheduled');
    }
  });

  it('refuses a game being tracked, or with plays from the tracker', async () => {
    const live = memoryGames({
      games: [game(1, { status: 'live', captureMode: 'live', homeScore: 2, awayScore: 0 })],
      roster,
    });
    expect(await setBoxScore(live.as(ownerId), input, live.deps)).toEqual({
      ok: false,
      error: { code: 'game-is-tracked' },
    });
    const played = memoryGames({ games: [game(1)], roster, tracked: [gameUuid(1)] });
    expect(await setBoxScore(played.as(ownerId), input, played.deps)).toEqual({
      ok: false,
      error: { code: 'game-is-tracked' },
    });
  });

  it('refuses a decided game (reopen it first), a moved-on one and a tie', async () => {
    const decided = memoryGames({ games: [finalGame(1)], roster });
    expect(await setBoxScore(decided.as(ownerId), input, decided.deps)).toEqual({
      ok: false,
      error: { code: 'game-already-decided' },
    });
    const moved = memoryGames({ games: [game(1, { version: 3 })], roster });
    expect(await setBoxScore(moved.as(ownerId), input, moved.deps)).toEqual({
      ok: false,
      error: { code: 'changed-since-read' },
    });
    const tie = memoryGames({ games: [game(1)], roster });
    expect(
      await setBoxScore(tie.as(ownerId), { ...input, homeScore: 20, awayScore: 20 }, tie.deps),
    ).toEqual({ ok: false, error: { code: 'tie-not-allowed' } });
  });

  it('refuses stats that are not whole counts, and unknown fields', async () => {
    const { deps, as } = memoryGames({ games: [game(1)], roster });
    for (const stats of [{ points: -1 }, { points: 1.5 }, { 'bad key': 1 }, { __proto__x: 1 }]) {
      const bad = { ...input, lines: [{ ...line(1, homeTeamId, {}), stats }] };
      expect(await setBoxScore(as(ownerId), bad, deps)).toMatchObject({
        ok: false,
        error: { code: 'invalid-input' },
      });
    }
    const extra = { ...input, lines: [{ ...line(1, homeTeamId, {}), jerseyNumber: '4' }] };
    expect(await setBoxScore(as(ownerId), extra, deps)).toMatchObject({
      error: { code: 'invalid-input' },
    });
  });

  it('lets a scorekeeper save it, but not an editor', async () => {
    const { deps, as } = memoryGames({
      games: [game(1)],
      roster,
      grants: [scorekeeperGrant, editorGrant],
    });
    expect(await setBoxScore(as(editorId), input, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(await setBoxScore(as(scorekeeperId), input, deps)).toMatchObject({ ok: true });
  });
});
