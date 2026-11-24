import { describe, expect, it } from 'vitest';
import { applyDraft } from './apply-draft.ts';
import { baseState, game } from './schedule-test-data.ts';
import { publishChangeCount, summarizePublish } from './summarize-publish.ts';

describe('publishChangeCount (step 2.161)', () => {
  it('counts what publishing would change, not the draft’s entries', () => {
    const published = baseState();
    const g1 = published.games[0] ?? game('g1');
    // A published game removed and put back as it was: two entries, no change.
    const back = applyDraft(
      published,
      [
        { kind: 'remove-game', gameId: 'g1' },
        { kind: 'add-game', game: { ...g1 } },
      ],
      [],
    );
    expect(back.rejected).toEqual([]);
    expect(publishChangeCount(summarizePublish(published, back.state))).toBe(0);
    // A new game added, removed and put back: three entries, one change.
    const added = game('g9', { homeTeamId: 'c', awayTeamId: 'a', time: '20:00' });
    const fresh = applyDraft(
      published,
      [
        { kind: 'add-game', game: added },
        { kind: 'remove-game', gameId: 'g9' },
        { kind: 'add-game', game: added },
      ],
      [],
    );
    expect(publishChangeCount(summarizePublish(published, fresh.state))).toBe(1);
    // A move and a renamed round: two.
    const two = applyDraft(
      published,
      [
        { kind: 'move-game', gameId: 'g2', to: { ...game('g2'), time: '20:30' } },
        { kind: 'rename-round', roundId: 'r1', label: 'Opening week' },
      ],
      [],
    );
    expect(publishChangeCount(summarizePublish(published, two.state))).toBe(2);
  });
});

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

describe('what the summary counts is what publishing writes (step 2.185)', () => {
  it('counts no recording change for a draft that names none, as publishing writes none', () => {
    const published = baseState();
    const g1 = published.games[0] ?? game('g1');
    const recorded = { ...published, games: [{ ...g1, recording: 'live' as const }] };
    // Removed and "put back" with no recording (a crafted post): publishing leaves the
    // game's recording as it is, so it is no change.
    const crafted = applyDraft(
      recorded,
      [
        { kind: 'remove-game', gameId: g1.id },
        { kind: 'add-game', game: { ...g1, recording: null } },
      ],
      [],
    );
    expect(summarizePublish(recorded, crafted.state).gamesRecordingChanged).toEqual([]);
    expect(publishChangeCount(summarizePublish(recorded, crafted.state))).toBe(0);
    // A recording the draft names is a change.
    const named = applyDraft(
      recorded,
      [{ kind: 'set-recording', gameId: g1.id, recording: 'box-score' }],
      [],
    );
    expect(summarizePublish(recorded, named.state).gamesRecordingChanged).toEqual([g1.id]);
  });

  it('puts a game back as the draft last held it, with what has happened to it since', () => {
    const published = baseState();
    const g1 = published.games[0] ?? game('g1');
    const played = {
      ...published,
      games: published.games.map((g) => (g.id === g1.id ? { ...g, status: 'final' as const } : g)),
    };
    const back = applyDraft(
      played,
      [
        { kind: 'remove-game', gameId: g1.id },
        { kind: 'put-back-game', gameId: g1.id },
      ],
      [],
    );
    expect(back.rejected).toEqual([]);
    expect(back.removed).toEqual([]);
    expect(back.state.games.find((g) => g.id === g1.id)?.status).toBe('final');
    expect(publishChangeCount(summarizePublish(played, back.state))).toBe(0);
  });
});

describe('a postponed game is never stuck in the draft (step 2.53 fix round)', () => {
  const waiting = () => {
    const s = baseState();
    return {
      ...s,
      games: s.games.map((g) => (g.id === 'g1' ? { ...g, status: 'postponed' as const } : g)),
    };
  };
  const slotOf = (id: string, s: ReturnType<typeof waiting>) => {
    const g = s.games.find((x) => x.id === id);
    if (g === undefined) throw new Error(`no ${id}`);
    const { roundId, date, time, venueId, court } = g;
    return { roundId, date, time, venueId, court };
  };

  it('counts its own old slot as its new date: publishing makes it scheduled', () => {
    const published = waiting();
    const result = applyDraft(
      published,
      [{ kind: 'move-game', gameId: 'g1', to: slotOf('g1', published) }],
      [],
    );
    expect(result.state.games.find((g) => g.id === 'g1')?.status).toBe('scheduled');
    const summary = summarizePublish(published, result.state);
    expect(summary.gamesMoved).toEqual(['g1']);
    expect(publishChangeCount(summary)).toBe(1);
  });

  it('makes a postponed game swapped into another slot scheduled, as a move does', () => {
    const published = waiting();
    const result = applyDraft(
      published,
      [{ kind: 'swap-games', gameId: 'g1', otherGameId: 'g2' }],
      [],
    );
    expect(result.rejected).toEqual([]);
    const g1 = result.state.games.find((g) => g.id === 'g1');
    expect(g1?.status).toBe('scheduled');
    expect(g1?.date).toBe(slotOf('g2', published).date);
    expect(result.state.games.find((g) => g.id === 'g2')?.status).toBe('scheduled');
  });

  it('takes a drafted new date back: the game is as published, nothing to publish', () => {
    const published = waiting();
    const result = applyDraft(
      published,
      [
        { kind: 'move-game', gameId: 'g1', to: { ...slotOf('g2', published), time: '21:00' } },
        { kind: 'take-back-date', gameId: 'g1', to: slotOf('g1', published), status: 'postponed' },
      ],
      [],
    );
    expect(result.rejected).toEqual([]);
    expect(result.state.games.find((g) => g.id === 'g1')).toEqual(
      published.games.find((g) => g.id === 'g1'),
    );
    expect(publishChangeCount(summarizePublish(published, result.state))).toBe(0);
  });

  it('after "Put it back on its date", a take-back drops the drafted move', () => {
    // The game is scheduled again in the published schedule; the take-back copies that.
    const published = baseState();
    const result = applyDraft(
      published,
      [
        { kind: 'move-game', gameId: 'g1', to: { ...slotOf('g1', waiting()), time: '21:00' } },
        { kind: 'take-back-date', gameId: 'g1', to: slotOf('g1', waiting()), status: 'scheduled' },
      ],
      [],
    );
    expect(publishChangeCount(summarizePublish(published, result.state))).toBe(0);
  });
});
