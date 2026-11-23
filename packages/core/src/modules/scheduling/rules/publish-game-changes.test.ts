import { describe, expect, it } from 'vitest';
import { publishGameChanges } from './publish-game-changes.ts';
import { baseState, game } from './schedule-test-data.ts';
import { summarizePublish } from './summarize-publish.ts';

describe('publishGameChanges (step 2.53)', () => {
  it('names each game added, moved and removed, with its old and new place', () => {
    const published = baseState();
    const result = {
      ...published,
      games: [
        // g1 moves to 20:00, g2 is removed, g3 stays, g4 is new.
        game('g1', { time: '20:00' }),
        game('g3', { roundId: 'r2', date: '2026-10-11', homeTeamId: 'a', awayTeamId: 'c' }),
        game('g4', { homeTeamId: 'b', awayTeamId: 'd', date: '2026-10-05' }),
      ],
    };
    const changes = publishGameChanges(published, result, summarizePublish(published, result));
    expect(changes.map((c) => [c.gameId, c.kind])).toEqual([
      ['g4', 'added'],
      ['g1', 'moved'],
      ['g2', 'removed'],
    ]);
    const [added, moved, removed] = changes;
    expect(added?.before).toBeNull();
    expect(added?.after?.date).toBe('2026-10-05');
    expect(moved?.before?.time).toBe('18:00');
    expect(moved?.after?.time).toBe('20:00');
    expect(removed).toMatchObject({ homeTeamId: 'c', awayTeamId: 'd', after: null });
    expect(removed?.before?.time).toBe('19:00');
  });

  it('puts games of one kind in the order of their time', () => {
    const published = { ...baseState(), games: [] };
    const result = {
      ...published,
      games: [game('late', { date: '2026-10-11' }), game('early', { date: '2026-10-04' })],
    };
    const changes = publishGameChanges(published, result, summarizePublish(published, result));
    expect(changes.map((c) => c.gameId)).toEqual(['early', 'late']);
  });

  it('is empty when publishing changes no game', () => {
    const published = baseState();
    expect(
      publishGameChanges(published, published, summarizePublish(published, published)),
    ).toEqual([]);
  });
});
