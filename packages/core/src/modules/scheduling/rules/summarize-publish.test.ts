import { describe, expect, it } from 'vitest';
import { applyDraft } from './apply-draft.ts';
import { baseState, game } from './schedule-test-data.ts';
import { summarizePublish } from './summarize-publish.ts';

describe('summarizePublish (P7 §4.4)', () => {
  it('has nothing to say when nothing changed', () => {
    expect(summarizePublish(baseState(), baseState())).toEqual({
      gamesAdded: [],
      gamesRemoved: [],
      gamesMoved: [],
      gamesRecordingChanged: [],
      roundsRenamed: [],
      roundsDateChanged: [],
      roundsAdded: [],
      roundsRemoved: [],
      teamsAffected: [],
    });
  });

  it('counts the rounds a draft adds and removes, and not one added and removed again', () => {
    const published = baseState();
    const { state, rejected } = applyDraft(
      published,
      [
        { kind: 'add-round', round: { id: 'r3', label: 'Week 3', date: '2026-10-18' } },
        { kind: 'add-round', round: { id: 'r4', label: 'Week 4', date: '2026-10-25' } },
        { kind: 'add-round', round: { id: 'r5', label: 'Oops', date: null } },
        { kind: 'remove-round', roundId: 'r5' },
        // Week 2's one game goes to the new Week 3, then Week 2 can go.
        {
          kind: 'move-game',
          gameId: 'g3',
          to: { ...game('g3'), roundId: 'r3', date: '2026-10-18' },
        },
        { kind: 'remove-round', roundId: 'r2' },
        // A new round renamed or re-dated in the draft is only added.
        { kind: 'rename-round', roundId: 'r4', label: 'Week 4, finals' },
        { kind: 'change-round-date', roundId: 'r4', date: '2026-10-26' },
      ],
      [],
    );
    expect(rejected).toEqual([]);
    const summary = summarizePublish(published, state);
    expect(summary.roundsAdded).toEqual(['r3', 'r4']);
    expect(summary.roundsRemoved).toEqual(['r2']);
    expect(summary.roundsRenamed).toEqual([]);
    expect(summary.roundsDateChanged).toEqual([]);
    expect(summary.gamesMoved).toEqual(['g3']);
  });

  it('counts added, removed and moved games, renamed rounds and affected teams', () => {
    const published = baseState();
    const { state } = applyDraft(
      published,
      [
        {
          kind: 'add-game',
          game: game('g9', { homeTeamId: 'e', awayTeamId: 'f', court: 'Court 2' }),
        },
        { kind: 'remove-game', gameId: 'g2' },
        { kind: 'swap-games', gameId: 'g1', otherGameId: 'g3' },
        { kind: 'rename-round', roundId: 'r2', label: 'Rivalry Week' },
        { kind: 'change-round-date', roundId: 'r2', date: '2026-10-12' },
      ],
      [],
    );
    const summary = summarizePublish(published, state);
    expect(summary.gamesAdded).toEqual(['g9']);
    expect(summary.gamesRemoved).toEqual(['g2']);
    expect(summary.gamesMoved).toEqual(['g1', 'g3']);
    expect(summary.roundsRenamed).toEqual(['r2']);
    expect(summary.roundsDateChanged).toEqual(['r2']);
    expect(summary.teamsAffected).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('does not count a rename alone as a moved game', () => {
    const published = baseState();
    const { state } = applyDraft(
      published,
      [{ kind: 'rename-round', roundId: 'r1', label: 'Opener' }],
      [],
    );
    const summary = summarizePublish(published, state);
    expect(summary.gamesMoved).toEqual([]);
    expect(summary.teamsAffected).toEqual([]);
  });

  it('lists a game whose recording mode changed, without counting its teams as affected', () => {
    const { state } = applyDraft(
      baseState(),
      [{ kind: 'set-recording', gameId: 'g1', recording: 'live' }],
      [],
    );
    const summary = summarizePublish(baseState(), state);
    expect(summary.gamesRecordingChanged).toEqual(['g1']);
    expect(summary.gamesMoved).toEqual([]);
    expect(summary.teamsAffected).toEqual([]);
  });

  it('does not count a round whose date a draft state clears', () => {
    const draft = baseState();
    draft.rounds = draft.rounds.map((r) => ({ ...r, date: null }));
    expect(summarizePublish(baseState(), draft).roundsDateChanged).toEqual([]);
  });
});
