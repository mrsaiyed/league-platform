// The schedule's answers as a one-time notice, never the address (step 2.155 part 6, T-434):
// what an answer leaves, how the grid reads it back, and when a kept answer to a button
// pressed twice is still the truth.
import type { ScheduleDraftView } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import {
  answerSaid,
  answerShown,
  gridAnswerHolds,
  refusedAtOf,
  refusedRoundGone,
  savedDetailOf,
} from './grid-answer.ts';
import { noticeOf } from './notice.ts';

const base = '/stand-in/admin/schedule';
const round = '22222222-2222-4222-8222-222222222222';
const game = '33333333-3333-4333-8333-333333333333';
const home = '44444444-4444-4444-8444-444444444444';

type Now = Pick<ScheduleDraftView, 'draft' | 'result'>;
const draft = { id: 'd', version: 2, basedOnRevision: 1, outOfDate: false, savedEdits: 1 };
const nowWith = (rounds: string[], games: string[], hasDraft = true): Now =>
  ({
    draft: hasDraft ? draft : null,
    result: { rounds: rounds.map((id) => ({ id })), games: games.map((id) => ({ id })) },
  }) as unknown as Now;

describe('answerShown', () => {
  it('never reads an answer from the address, a hand-typed one shows nothing', () => {
    const typed = {
      season: 's',
      done: 'published',
      saved: 'round-added',
      round,
      problem: 'invalid-input',
      at: 'add-round',
      label: 'Week 9',
      blocker: 'round-in-use',
    };
    const read = answerShown(typed, undefined, base);
    expect(read).toEqual({ season: 's' });
    expect(noticeOf(read)).toBeUndefined();
    expect(savedDetailOf(read)).toBeUndefined();
    expect(refusedAtOf(read)).toBeUndefined();
  });

  it('reads "round added" and "published" from the notice for this page only', () => {
    const said = answerSaid({ kind: 'saved', detail: { what: 'round-added', roundId: round } });
    expect(savedDetailOf(answerShown({}, { thing: base, said }, base))).toEqual({
      what: 'round-added',
      roundId: round,
    });
    expect(answerShown({}, { thing: '/other/admin/schedule', said }, base)).toEqual({});
    const published = answerSaid({ kind: 'published', removed: 2 });
    const read = answerShown({ season: 's' }, { thing: base, said: published }, base);
    expect(read).toEqual({ season: 's', done: 'published', removed: '2' });
  });

  it("keeps a refused form's typed boxes in the notice, the harmful text only as text", () => {
    const label = '<img src=x onerror=alert(1)>';
    const said = answerSaid({
      kind: 'refused',
      code: 'invalid-input',
      at: { form: 'add-round', label, date: '2026-12-01' },
    });
    const read = answerShown({}, { thing: base, said }, base);
    expect(refusedAtOf(read)).toEqual({ form: 'add-round', label, date: '2026-12-01' });
    const gameSaid = answerSaid({
      kind: 'refused',
      code: 'invalid-input',
      at: {
        form: 'add-game',
        typed: {
          homeTeamId: home,
          awayTeamId: '',
          roundId: round,
          date: '2026-12-02',
          time: '18:30',
          place: 'Hall & "B"',
          recording: '',
        },
      },
    });
    expect(refusedAtOf(answerShown({}, { thing: base, said: gameSaid }, base))).toMatchObject({
      form: 'add-game',
      typed: { homeTeamId: home, date: '2026-12-02', time: '18:30', place: 'Hall & "B"' },
    });
  });

  it('reads only answer words from a notice, never one of its own the address would hold', () => {
    const read = answerShown({ season: 's' }, { thing: base, said: '?season=x&done=saved' }, base);
    expect(read).toEqual({ season: 's', done: 'saved' });
    expect(answerShown({}, { thing: base, said: 'game-removed' }, base)).toEqual({});
  });
});

describe('gridAnswerHolds', () => {
  it('gives a kept "round added" again only while the round is in the draft', () => {
    const added = { kind: 'saved', detail: { what: 'round-added', roundId: round } } as const;
    expect(gridAnswerHolds(added, nowWith([round], []))).toBe(true);
    expect(gridAnswerHolds(added, nowWith([], []))).toBe(false);
    expect(gridAnswerHolds(added, nowWith([round], [], false))).toBe(false);
  });

  it('gives a kept game save while the game is there, a removal while it is gone', () => {
    const saved = { kind: 'saved', detail: { what: 'game-saved', gameId: game } } as const;
    expect(gridAnswerHolds(saved, nowWith([], [game]))).toBe(true);
    expect(gridAnswerHolds(saved, nowWith([], []))).toBe(false);
    const removed = {
      kind: 'saved',
      detail: { what: 'game-removed', roundId: null, gameId: game },
    } as const;
    expect(gridAnswerHolds(removed, nowWith([], []))).toBe(true);
    expect(gridAnswerHolds(removed, nowWith([], [game]))).toBe(false);
  });

  it('gives a kept "round removed" while the round stays gone (a second "Remove this round")', () => {
    const removed = {
      kind: 'saved',
      detail: { what: 'round-removed', afterRoundId: null, roundId: round },
    } as const;
    expect(gridAnswerHolds(removed, nowWith([], []))).toBe(true);
    expect(gridAnswerHolds(removed, nowWith([round], []))).toBe(false);
    expect(gridAnswerHolds(removed, nowWith([], [], false))).toBe(false);
    // An answer that names no round is never given again.
    const unnamed = {
      kind: 'saved',
      detail: { what: 'round-removed', afterRoundId: null },
    } as const;
    expect(gridAnswerHolds(unnamed, nowWith([], []))).toBe(false);
  });

  it('gives a kept "round removed" again only while that same round is gone, whatever happened between', () => {
    // Last helper of part 6: a second tap after something else changed the draft.
    const other = '55555555-5555-4555-8555-555555555555';
    const removed = {
      kind: 'saved',
      detail: { what: 'round-removed', afterRoundId: other, roundId: round },
    } as const;
    // Put back from the bin in between (the same id is back): run again, its command answers.
    expect(gridAnswerHolds(removed, nowWith([round, other], []))).toBe(false);
    // Another round removed in between: this one is still gone, the first answer is the truth
    // and nothing runs, so the other round is never touched.
    expect(gridAnswerHolds(removed, nowWith([], []))).toBe(true);
    // Its neighbour kept, the answer still holds: it is read by its own round, not the one after.
    expect(gridAnswerHolds(removed, nowWith([other], []))).toBe(true);
    // Published in between: no draft, run again (refused by its command, never "removed").
    expect(gridAnswerHolds(removed, nowWith([other], [], false))).toBe(false);
    // Published, put back and a new draft started: the round is in it, run again.
    expect(gridAnswerHolds(removed, nowWith([round], []))).toBe(false);
  });

  it('gives a kept publish while no draft was started since; a refusal always', () => {
    expect(gridAnswerHolds({ kind: 'published' }, nowWith([], [], false))).toBe(true);
    expect(gridAnswerHolds({ kind: 'published' }, nowWith([], []))).toBe(false);
    expect(gridAnswerHolds({ kind: 'refused', code: 'stale-version' }, nowWith([], []))).toBe(true);
  });
});

describe('refusedRoundGone', () => {
  const at = { form: 'round', roundId: round } as const;
  it('names a refused round that is no longer drawn, from the bin', () => {
    const binned = [{ id: round, number: 2, label: 'Week 2' }];
    expect(refusedRoundGone(at, [], binned)).toEqual({
      roundId: round,
      round: { number: 2, label: 'Week 2' },
    });
    // Not in the bin either: its id only, so its anchor still lands on the notice.
    expect(refusedRoundGone(at, [], [])).toEqual({ roundId: round });
  });
  it('says nothing at the top while the round is drawn, or for another form', () => {
    expect(refusedRoundGone(at, [{ id: round }], [])).toBeUndefined();
    expect(refusedRoundGone({ form: 'add-round', label: '', date: '' }, [], [])).toBeUndefined();
    expect(refusedRoundGone(undefined, [], [])).toBeUndefined();
  });
});
