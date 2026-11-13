// An empty change touches nothing, so it never reaches the database.
import { describe, expect, it } from 'vitest';
import type { LeagueScope } from '../db/transaction-scope.ts';
import { updatePublishedGame } from './update-published-game.ts';

describe('updatePublishedGame', () => {
  it('changes nothing, and runs no query, when the change names no slot and no mode', async () => {
    // A scope that cannot run a query: reaching the database would throw.
    const scope = {} as LeagueScope;
    expect(await updatePublishedGame(scope, 'season', 'game', {})).toBe(false);
  });
});
