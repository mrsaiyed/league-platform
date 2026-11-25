import { correctionPlaySource, playSourceKey } from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { linesOf, readState, rosterOf } from '../live-game.ts';
import { awayTeamId, homeTeamId, ownerId, scorekeeperId } from '../memory-games.test-helper.ts';
import {
  awayIds,
  gameId,
  homeIds,
  setUp,
  tap,
  versionOf,
  type Tracker,
} from '../reopen-game.test-helper.ts';
import { correctTrackedBoxScore, maxCorrectionPlays } from './correct-tracked-box-score.ts';
import { readTrackedBoxScore } from './read-tracked-box-score.ts';
import { readTrackerState } from './read-tracker-state.ts';
import { reopenGame } from './reopen-game.ts';

const [h0 = '', h1 = ''] = homeIds;
const [a0 = ''] = awayIds;

/** Scored on the tablet: home 3 + 2, away 2, a foul on the wrong home player; then ended. */
async function endedWithFoul(t: Tracker) {
  await tap(t, [
    { type: 'lineup', side: 'home', playerIds: homeIds },
    { type: 'lineup', side: 'away', playerIds: awayIds },
    { type: 'start' },
    { type: 'score', side: 'home', playerId: h0, points: 3 },
    { type: 'foul', side: 'home', playerId: h0 },
    { type: 'score', side: 'home', playerId: h1, points: 2 },
    { type: 'score', side: 'away', playerId: a0, points: 2 },
  ]);
  t.clock.advance(1800);
  expect(await tap(t, [{ type: 'end' }])).toEqual(['accepted']);
}

async function reopened(t: Tracker) {
  await endedWithFoul(t);
  const result = await reopenGame(
    t.as(ownerId),
    { gameId, version: versionOf(t), reason: 'The foul was the other player’s' },
    t.deps,
  );
  expect(result.ok).toBe(true);
}

async function grid(t: Tracker, accountId = ownerId) {
  const read = await readTrackedBoxScore(t.as(accountId), { gameId }, t.deps);
  if (!read.ok) throw new Error(`read refused: ${read.error.code}`);
  return read.value;
}

const correct = (t: Tracker, sequence: number, lines: object[], accountId: string = ownerId) =>
  correctTrackedBoxScore(t.as(accountId), { gameId, sequence, lines }, t.deps);

const endAgain = (t: Tracker, sequence: number, lines: object[] = [], accountId = ownerId) =>
  correctTrackedBoxScore(t.as(accountId), { gameId, sequence, lines, end: true }, t.deps);

/**
 * The game's event log replayed with the engine from nothing: the lines it gives. With
 * `withoutMark`, each payload is read with its source (T-408) taken out first.
 */
function replayedLines(t: Tracker, withoutMark = false) {
  const game = t.db.state.games[0];
  if (game === undefined) throw new Error('no game');
  return linesOf(game, rosterOf(t.db.state.players), replayedState(t, withoutMark));
}

/** The game's state as its event log replayed with the engine from nothing gives it. */
function replayedState(t: Tracker, withoutMark = false) {
  const saved = t.db.state.states.find((s) => s.gameId === gameId);
  const game = t.db.state.games[0];
  if (saved === undefined || game === undefined) throw new Error('no game');
  let state = basketball.newGame(readState(saved.state).rules, 0);
  const events = t.db.state.events
    .filter((e) => e.gameId === gameId)
    .toSorted((a, b) => a.seq - b.seq);
  for (const event of events) {
    const { [playSourceKey]: _source, ...engineFields } = event.payload;
    const payload = withoutMark ? engineFields : event.payload;
    const command = { type: event.type, ...payload } as basketball.Command;
    state = basketball.apply(state, command, { id: event.commandId, now: event.tappedAt });
  }
  return state;
}

const foulsOf = (lines: ReturnType<typeof replayedLines>, id: string) => lines.get(id)?.stats.fouls;

describe('games.correct_tracked_box_score (step 2.65, T-122)', () => {
  it('a foul moved to the right player is two commands in the log, and the replay gives the grid', async () => {
    const t = setUp();
    await reopened(t);
    const before = await grid(t);
    expect(before.correctable).toBe(true);
    expect(before.lines.find((l) => l.personId === h0)).toMatchObject({
      fouls: 1,
      points: 3,
      fg3: 1,
    });
    const result = await correct(t, before.sequence, [
      { teamId: homeTeamId, personId: h0, fouls: 0 },
      { teamId: homeTeamId, personId: h1, fouls: 1 },
    ]);
    expect(result).toEqual({
      ok: true,
      value: {
        sequence: before.sequence + 2,
        plays: 2,
        ended: false,
        written: [
          { type: 'unfoul', side: 'home', playerId: h0 },
          { type: 'foul', side: 'home', playerId: h1 },
        ],
      },
    });
    const added = t.db.state.events.filter((e) => e.seq > before.sequence);
    const mark = { [playSourceKey]: correctionPlaySource };
    expect(added.map((e) => [e.type, e.payload, e.accountId])).toEqual([
      ['unfoul', { side: 'home', playerId: h0, ...mark }, ownerId],
      ['foul', { side: 'home', playerId: h1, ...mark }, ownerId],
    ]);
    const replayed = replayedLines(t);
    expect([foulsOf(replayed, h0), foulsOf(replayed, h1)]).toEqual([0, 1]);
    // The saved lines, the grid read again and the replay say the same.
    const after = await grid(t);
    for (const line of after.lines) {
      const stats = replayed.get(line.personId)?.stats ?? {};
      expect(line).toMatchObject({ fouls: stats.fouls ?? 0, points: stats.points ?? 0 });
    }
    const saved = t.db.state.liveLines.find((l) => l.personId === h1);
    expect(saved?.stats.fouls).toBe(1);
    expect(t.db.state.activity.at(-1)?.action).toBe('games.correct_tracked_box_score');
    // Still live, to be ended again.
    expect(t.db.state.games[0]?.status).toBe('live');
  });

  it('T-408: a grid save’s plays carry the mark, the tablet’s do not, and a replay ignores it', async () => {
    const t = setUp();
    await reopened(t);
    const { sequence } = await grid(t);
    await correct(t, sequence, [
      { teamId: homeTeamId, personId: h0, fouls: 0 },
      { teamId: awayTeamId, personId: a0, fg1: 1 },
    ]);
    // The tablet's tap after the correction carries no mark either.
    expect(await tap(t, [{ type: 'score', side: 'home', playerId: h1, points: 2 }])).toEqual([
      'accepted',
    ]);
    const events = t.db.state.events.filter((e) => e.gameId === gameId);
    const marked = events.filter((e) => playSourceKey in e.payload);
    expect(marked.map((e) => [e.type, e.payload[playSourceKey]])).toEqual([
      ['unfoul', correctionPlaySource],
      ['score', correctionPlaySource],
    ]);
    expect(marked.every((e) => e.seq > sequence && e.accountId === ownerId)).toBe(true);
    // Every play scored on the tablet, before and after, is read as the scoring screen's.
    expect(events.filter((e) => !(playSourceKey in e.payload)).length).toBe(events.length - 2);
    // The same lines with or without the mark.
    const withMark = replayedLines(t);
    expect(replayedLines(t, true)).toEqual(withMark);
    expect(withMark.get(a0)?.stats.points).toBe(3);
    // The scorekeeper's device is told which plays a correction wrote; its own are not named.
    const read = await readTrackerState(t.as(scorekeeperId), { gameId }, t.deps);
    if (!read.ok) throw new Error(`read refused: ${read.error.code}`);
    expect(read.value.corrections).toEqual(marked.map((e) => e.commandId.toLowerCase()));
    expect(read.value.state.plays.at(-1)?.id).toBe(events.at(-1)?.commandId);
  });

  it('a basket added moves the score; nothing changed adds nothing', async () => {
    const t = setUp();
    await reopened(t);
    const { sequence } = await grid(t);
    expect(await correct(t, sequence, [{ teamId: homeTeamId, personId: h0, fouls: 1 }])).toEqual({
      ok: true,
      value: { sequence, plays: 0, ended: false, written: [] },
    });
    expect(t.db.state.events.filter((e) => e.seq > sequence)).toEqual([]);
    const result = await correct(t, sequence, [{ teamId: awayTeamId, personId: a0, fg1: 1 }]);
    expect(result.ok).toBe(true);
    expect(t.db.state.games[0]).toMatchObject({ homeScore: 5, awayScore: 3 });
    expect(replayedLines(t).get(a0)?.stats.points).toBe(3);
  });

  it('refuses a game not reopened with a reason, and writes nothing', async () => {
    const t = setUp();
    await endedWithFoul(t);
    const events = t.db.state.events.length;
    const line = [{ teamId: homeTeamId, personId: h0, fouls: 0 }];
    expect((await grid(t)).notCorrectable).toBe('game-final');
    expect(await correct(t, events, line)).toEqual({ ok: false, error: { code: 'game-final' } });
    const live = setUp();
    await tap(live, [
      { type: 'lineup', side: 'home', playerIds: homeIds },
      { type: 'foul', side: 'home', playerId: h0 },
    ]);
    expect(await correct(live, 2, line)).toEqual({ ok: false, error: { code: 'reason-needed' } });
    expect(t.db.state.events.length).toBe(events);
  });

  it('two points moved from one player to another: a take-back and a basket, and the replay agrees (T-436)', async () => {
    const t = setUp();
    await reopened(t);
    const before = await grid(t);
    const basket = t.db.state.events.find(
      (e) => e.type === 'score' && e.payload['playerId'] === h1,
    );
    if (basket === undefined) throw new Error('no basket');
    const result = await correct(t, before.sequence, [
      { teamId: homeTeamId, personId: h1, fg2: 0 },
      { teamId: homeTeamId, personId: h0, fg2: 1 },
    ]);
    expect(result.ok).toBe(true);
    // The save names the basket it took back with the period it was made in (L3).
    const madeIn = t.db.state.events.find((e) => e.commandId === basket.commandId);
    expect(result.ok && result.value.written[0]).toMatchObject({
      type: 'unscore',
      playerId: h1,
      points: 2,
      basketPeriod: expect.any(Number),
    });
    expect(madeIn).toBeDefined();
    const mark = { [playSourceKey]: correctionPlaySource };
    const added = t.db.state.events.filter((e) => e.seq > before.sequence);
    expect(added.map((e) => [e.type, e.payload])).toEqual([
      ['unscore', { side: 'home', playerId: h1, points: 2, playId: basket.commandId, ...mark }],
      ['score', { side: 'home', playerId: h0, points: 2, ...mark }],
    ]);
    const after = await grid(t);
    const pointsOf = (id: string) => after.lines.find((l) => l.personId === id)?.points;
    expect([pointsOf(h0), pointsOf(h1)]).toEqual([5, 0]);
    expect(after.lines.find((l) => l.personId === h1)).toMatchObject({ fg2: 0 });
    // The replayed log gives the grid's lines, the score and the score by period.
    const replayed = replayedLines(t);
    expect([replayed.get(h0)?.stats.points, replayed.get(h1)?.stats.points]).toEqual([5, 0]);
    const saved = t.db.state.states.find((s) => s.gameId === gameId);
    if (saved === undefined) throw new Error('no state');
    const state = readState(saved.state);
    const again = replayedState(t);
    expect(basketball.scoreByPeriod(state.plays)).toEqual(basketball.scoreByPeriod(again.plays));
    expect(basketball.scoreByPeriod(again.plays)).toEqual({ home: [5], away: [2] });
    expect(basketball.derive(again).teams.home.score).toBe(5);
  });

  it('refuses a grid read before something else was recorded', async () => {
    const t = setUp();
    await reopened(t);
    const { sequence } = await grid(t);
    const events = t.db.state.events.length;
    const line = [{ teamId: homeTeamId, personId: h0, fouls: 0 }];
    expect(await correct(t, sequence - 1, line)).toEqual({
      ok: false,
      error: { code: 'changed-since-read' },
    });
    expect(t.db.state.events.length).toBe(events);
  });

  it('is refused to whoever may not correct games', async () => {
    const t = setUp();
    await reopened(t);
    const { sequence } = await grid(t);
    const line = [{ teamId: homeTeamId, personId: h0, fouls: 0 }];
    expect(await correct(t, sequence, line, scorekeeperId)).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
    // "End the game again" from the scorekeeper is refused the same way, and writes nothing.
    const events = t.db.state.events.length;
    expect(await endAgain(t, sequence, [], scorekeeperId)).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
    expect([t.db.state.events.length, t.db.state.games[0]?.status]).toEqual([events, 'live']);
    // Another league's admin: the memory stores keep one league, so that case is the
    // two-league harness's (packages/database/src/isolation/grid-correction-cases).
  });

  it('in an archived season: refused until reopened with a reason, then the corrector’s, as the tracker’s work (O-12)', async () => {
    const t = setUp();
    await endedWithFoul(t);
    t.db.state.seasons = t.db.state.seasons.map((x) => ({ ...x, status: 'completed' }));
    const events = t.db.state.events.length;
    const line = [{ teamId: homeTeamId, personId: h0, fouls: 0 }];
    // The grid offers nothing (the pages follow `correctable`), and the command refuses.
    expect((await grid(t)).correctable).toBe(false);
    const archived = { ok: false, error: { code: 'season-archived' } };
    expect(await correct(t, events, line)).toEqual(archived);
    expect(await endAgain(t, events)).toEqual(archived);
    expect([t.db.state.events.length, t.db.state.games[0]?.status]).toEqual([events, 'final']);
    // A correction with a reason is still the admin's there (S-7): then the grid is theirs.
    const reopen = await reopenGame(
      t.as(ownerId),
      { gameId, version: versionOf(t), reason: 'The foul was the other player’s' },
      t.deps,
    );
    expect(reopen.ok).toBe(true);
    const { sequence, correctable } = await grid(t);
    expect(correctable).toBe(true);
    const saved = await correct(t, sequence, line);
    if (!saved.ok) throw new Error(`save refused: ${saved.error.code}`);
    const ended = await endAgain(t, saved.value.sequence);
    if (!ended.ok) throw new Error(`end refused: ${ended.error.code}`);
    expect([ended.value.ended, t.db.state.games[0]?.status]).toEqual([true, 'final']);
    // Final again, so read-only again: nothing more is corrected without a new reason.
    expect(await correct(t, ended.value.sequence, line)).toEqual(archived);
  });

  it('ends the game again with the scoring screen’s own end, while the tablet still holds it (T-407)', async () => {
    const t = setUp();
    await reopened(t);
    const { sequence } = await grid(t);
    // The tablet's session is the scorekeeper's: the grid asks for none.
    expect(t.db.state.sessions.map((s) => s.accountId)).toEqual([scorekeeperId]);
    const result = await endAgain(t, sequence, [{ teamId: awayTeamId, personId: a0, fg2: 2 }]);
    expect(result).toEqual({
      ok: true,
      value: {
        sequence: sequence + 2,
        plays: 1,
        ended: true,
        written: [{ type: 'score', side: 'away', playerId: a0, points: 2 }],
      },
    });
    const added = t.db.state.events.filter((e) => e.seq > sequence);
    expect(added.map((e) => [e.type, e.accountId])).toEqual([
      ['score', ownerId],
      ['end', ownerId],
    ]);
    expect(t.db.state.games[0]).toMatchObject({ status: 'final', homeScore: 5, awayScore: 4 });
    expect((await grid(t)).notCorrectable).toBe('game-final');
    // The tablet's next tap is told the game can no longer be scored.
    expect(await tap(t, [{ type: 'foul', side: 'away', playerId: a0 }])).toEqual(['refused']);
  });

  it('refuses to end again on a level score the rules do not allow, and writes nothing', async () => {
    const t = setUp();
    await reopened(t);
    const { sequence } = await grid(t);
    const events = t.db.state.events.length;
    const level = [{ teamId: awayTeamId, personId: a0, fg3: 1 }];
    expect(await endAgain(t, sequence, level)).toEqual({
      ok: false,
      error: { code: 'tie-not-allowed' },
    });
    expect(t.db.state.events.length).toBe(events);
    expect(t.db.state.games[0]?.status).toBe('live');
  });

  it('refuses by name a statistic the season does not keep, and a save of too many plays', async () => {
    const t = setUp();
    await reopened(t);
    const { sequence } = await grid(t);
    const events = t.db.state.events.length;
    // The high-school preset keeps no turnovers.
    expect(
      await correct(t, sequence, [{ teamId: homeTeamId, personId: h0, turnovers: 1 }]),
    ).toEqual({
      ok: false,
      error: { code: 'statistic-not-kept', personId: h0, statistic: 'turnovers' },
    });
    const many = [{ teamId: awayTeamId, personId: a0, fg1: maxCorrectionPlays + 1 }];
    expect(await correct(t, sequence, many)).toEqual({
      ok: false,
      error: { code: 'too-many-plays', limit: maxCorrectionPlays },
    });
    expect(t.db.state.events.length).toBe(events);
  });
});
