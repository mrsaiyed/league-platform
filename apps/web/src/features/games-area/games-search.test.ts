import { describe, expect, it } from 'vitest';
import { gameIdOf, gamesReturn, readGamesSearch, typedScoresOf } from './games-search.ts';

const id = '01900000-0000-7000-8000-006A00000001';
const lower = id.toLowerCase();

describe("the games area's address after a tap (step 2.154)", () => {
  it('reads the question only with a game, its version and two whole scores', () => {
    expect(readGamesSearch({ ask: id, v: '3', home: '51', away: '047' })).toEqual({
      ask: { gameId: lower, version: 3, homeScore: '51', awayScore: '47' },
    });
    for (const broken of [
      { ask: id, v: '3', home: '51' },
      { ask: id, v: 'x', home: '51', away: '47' },
      { ask: id, v: '3', home: '1000', away: '47' },
      { ask: id, v: '3', home: '-1', away: '47' },
      { ask: 'not-a-game', v: '3', home: '51', away: '47' },
    ]) {
      expect(readGamesSearch(broken).ask, JSON.stringify(broken)).toBeUndefined();
    }
  });

  it('reads the open boxes with what was typed, or none', () => {
    expect(readGamesSearch({ enter: id, home: '51', away: '47' })).toEqual({
      enter: { gameId: lower, typed: { homeScore: '51', awayScore: '47' } },
    });
    expect(readGamesSearch({ enter: id })).toEqual({ enter: { gameId: lower } });
  });

  it('reads what was done or refused, and to which game, ignoring anything else', () => {
    expect(readGamesSearch({ done: 'final', game: id })).toEqual({ done: 'final', game: lower });
    expect(readGamesSearch({ done: 'reopen' })).toEqual({ done: 'reopen' });
    expect(readGamesSearch({ done: 'delete', problem: 'tie-not-allowed' })).toEqual({
      problem: 'tie-not-allowed',
    });
    expect(readGamesSearch({ problem: '<b>', game: 'x' })).toEqual({});
    expect(readGamesSearch({ done: ['final', 'final'] })).toEqual({});
  });

  it('sends the browser back to the game on the list', () => {
    expect(gamesReturn({ done: 'final', game: lower }, lower)).toBe(
      `?done=final&game=${lower}#game-${lower}`,
    );
    expect(gamesReturn({ problem: 'game-not-found' })).toBe('?problem=game-not-found');
    expect(gamesReturn({})).toBe('');
  });

  it('takes a game id and two typed scores only in their own shapes', () => {
    expect(gameIdOf(` ${id} `)).toBe(lower);
    expect(gameIdOf('1')).toBeUndefined();
    expect(typedScoresOf(' 7', '0')).toEqual({ homeScore: '7', awayScore: '0' });
    expect(typedScoresOf('7.5', '0')).toBeUndefined();
    expect(typedScoresOf('', '0')).toBeUndefined();
  });
});
