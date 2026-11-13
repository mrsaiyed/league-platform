// A scope is made only for a real id, reaches its transaction only while open, and
// cannot be changed.
import type { Transaction } from 'kysely';
import { describe, expect, it } from 'vitest';
import type { Database } from './schema-types.ts';
import { closeScope, openScope, transactionOf } from './transaction-scope.ts';

// Never used as a transaction: the scope only stores and returns it.
const trx = {} as Transaction<Database>;
const league = '0190a7c4-1b2c-7d3e-8f40-123456789abc';

describe('openScope', () => {
  it('makes a league scope that reaches its transaction until closed', () => {
    const scope = openScope(trx, league, null);
    expect(scope).toEqual({ leagueId: league, accountId: null });
    expect(transactionOf(scope)).toBe(trx);
    closeScope(scope);
    expect(() => transactionOf(scope)).toThrow('not open');
  });

  it('makes a scope with no league when none is given', () => {
    const scope = openScope(trx, null, league);
    expect(scope).toEqual({ accountId: league });
    expect('leagueId' in scope).toBe(false);
    closeScope(scope);
  });

  it('refuses an id that is not a lower-case UUID', () => {
    expect(() => openScope(trx, 'league-a', null)).toThrow('leagueId is not a lower-case UUID');
    expect(() => openScope(trx, league.toUpperCase(), null)).toThrow('leagueId');
    expect(() => openScope(trx, league, '')).toThrow('accountId is not a lower-case UUID');
  });

  it('cannot be changed to another league', () => {
    const scope = openScope(trx, league, null);
    expect(Object.isFrozen(scope)).toBe(true);
    closeScope(scope);
  });

  it('refuses a scope it did not make', () => {
    const forged = { ...openScope(trx, league, null) };
    expect(() => transactionOf(forged)).toThrow('not open');
  });
});
