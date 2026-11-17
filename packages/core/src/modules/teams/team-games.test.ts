import { describe, expect, it } from 'vitest';
import { gamesToPlay } from './team-games.ts';

const team = 'team-a';
const added = (id: string, home: string, away: string, status = 'scheduled') => ({
  kind: 'add-game',
  game: {
    id,
    roundId: null,
    date: '2026-12-01',
    time: null,
    venueId: null,
    court: null,
    homeTeamId: home,
    awayTeamId: away,
    status,
  },
});
const removed = (id: string) => ({ kind: 'remove-game', gameId: id });
const draft = (...changes: unknown[]) => ({ version: 1, changes });
const published = (id: string, date: string | null = '2026-11-22', round: number | null = 6) => ({
  id,
  date,
  round,
});
const read = (toPlay: ReturnType<typeof published>[], draftChanges: unknown = null) =>
  gamesToPlay({ played: 0, toPlay, draftChanges }, team);

describe('gamesToPlay (A-17)', () => {
  it('counts the published games without a result, with their days and rounds', () => {
    expect(read([published('g1'), published('g2', '2026-11-29', 7)])).toEqual({
      toPlay: 2,
      removedInDraft: 0,
      which: [
        { date: '2026-11-22', round: 6 },
        { date: '2026-11-29', round: 7 },
      ],
    });
  });

  it("adds the draft's games of the team, by day, not other teams' or ones already decided", () => {
    const changes = draft(
      added('d1', team, 'b'),
      added('d2', 'b', team),
      added('d3', 'b', 'c'),
      added('d4', team, 'b', 'final'),
    );
    const got = read([published('g1', '2026-12-08', 9)], changes);
    expect(got.toPlay).toBe(3);
    expect(got.which).toEqual([
      { date: '2026-12-01', round: null },
      { date: '2026-12-01', round: null },
      { date: '2026-12-08', round: 9 },
    ]);
  });

  it('leaves out a game the draft adds and removes again', () => {
    expect(read([], draft(added('d1', team, 'b'), removed('d1'))).toPlay).toBe(0);
  });

  it('still counts a published game the draft removes, and says it is removed in the draft', () => {
    expect(read([published('g1'), published('g2')], draft(removed('g1')))).toMatchObject({
      toPlay: 2,
      removedInDraft: 1,
    });
  });

  it('counts once, and not as removed, a published game the draft removes and puts back', () => {
    const changes = draft(removed('g1'), added('g1', team, 'b'));
    expect(read([published('g1')], changes)).toMatchObject({ toPlay: 1, removedInDraft: 0 });
  });

  it('adds nothing for a draft it cannot read', () => {
    expect(read([published('g1')], { version: 9 }).toPlay).toBe(1);
  });
});
