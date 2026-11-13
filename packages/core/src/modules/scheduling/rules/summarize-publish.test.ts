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
      roundsRenamed: [],
      roundsDateChanged: [],
      teamsAffected: [],
    });
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
});
