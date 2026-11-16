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

describe('gamesToPlay (A-17)', () => {
  it('counts the published games to play with no draft', () => {
    expect(gamesToPlay({ played: 0, toPlayIds: ['g1', 'g2'], draftChanges: null }, team)).toBe(2);
  });

  it("adds the draft's games of the team, not other teams' or ones already decided", () => {
    const changes = draft(
      added('d1', team, 'b'),
      added('d2', 'b', team),
      added('d3', 'b', 'c'),
      added('d4', team, 'b', 'final'),
    );
    expect(gamesToPlay({ played: 0, toPlayIds: ['g1'], draftChanges: changes }, team)).toBe(3);
  });

  it('leaves out a game the draft adds and removes again', () => {
    const changes = draft(added('d1', team, 'b'), removed('d1'));
    expect(gamesToPlay({ played: 0, toPlayIds: [], draftChanges: changes }, team)).toBe(0);
  });

  it('still counts a published game the draft removes: the public sees it until publishing', () => {
    const changes = draft(removed('g1'));
    expect(gamesToPlay({ played: 0, toPlayIds: ['g1'], draftChanges: changes }, team)).toBe(1);
  });

  it('counts once a published game the draft removes and puts back', () => {
    const changes = draft(removed('g1'), added('g1', team, 'b'));
    expect(gamesToPlay({ played: 0, toPlayIds: ['g1'], draftChanges: changes }, team)).toBe(1);
  });

  it('adds nothing for a draft it cannot read', () => {
    expect(gamesToPlay({ played: 0, toPlayIds: ['g1'], draftChanges: { version: 9 } }, team)).toBe(
      1,
    );
  });
});
