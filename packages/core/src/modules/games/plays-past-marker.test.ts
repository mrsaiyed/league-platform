// The rule of "has plays" for events kept in memory (record 061, record 058).
import { tablePlayerEventTypes } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import type { NewGameEvent } from './ports.ts';
import { hasPlaysPastMarker } from './plays-past-marker.ts';

const game = 'game-1';
const log = (types: readonly string[], gameId = game): NewGameEvent[] =>
  types.map((type, i) => ({
    gameId,
    seq: i + 1,
    commandId: `${gameId}-${i}`,
    type,
    payload: {},
    tappedAt: 0,
    accountId: 'account-1',
  }));

describe('whether a game has plays past its last marker', () => {
  it('is no for no events, and yes for any play when never marked', () => {
    expect(hasPlaysPastMarker([], game)).toBe(false);
    expect(hasPlaysPastMarker(log(['lineup']), game)).toBe(true);
  });

  it('counts only what came after the last reset', () => {
    expect(hasPlaysPastMarker(log(['start', 'score', 'reset']), game)).toBe(false);
    expect(hasPlaysPastMarker(log(['start', 'reset', 'lineup']), game)).toBe(true);
    expect(hasPlaysPastMarker(log(['start', 'reset', 'start', 'reset']), game)).toBe(false);
  });

  it('never counts a change of players at the table, before or after a marker', () => {
    for (const type of tablePlayerEventTypes) {
      expect(hasPlaysPastMarker(log([type]), game), type).toBe(false);
      expect(hasPlaysPastMarker(log(['start', 'reset', type]), game), type).toBe(false);
    }
  });

  it('reads only the game asked about', () => {
    expect(hasPlaysPastMarker(log(['start'], 'game-2'), game)).toBe(false);
  });
});
