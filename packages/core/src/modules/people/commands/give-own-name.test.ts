import { describe, expect, it } from 'vitest';
import type { OwnName, OwnNameStore } from '../own-name.ts';
import { giveOwnName } from './give-own-name.ts';

/** An own-name store in memory, keyed by account, as the stand-in world keeps one. */
function memoryStore(): OwnNameStore & { readonly names: Map<string, OwnName> } {
  const names = new Map<string, OwnName>();
  return {
    names,
    create: async (accountId, name) => {
      if (names.has(accountId)) return 'already-has-one';
      names.set(accountId, name);
      return 'made';
    },
    rename: async (accountId, name) => {
      if (!names.has(accountId)) return 'no-own-profile';
      names.set(accountId, name);
      return 'renamed';
    },
  };
}

const context = { accountId: 'a1', requestId: 'r1' };

describe('giveOwnName (R-21)', () => {
  it('makes the account’s own name, trimmed, for the session’s account only', async () => {
    const store = memoryStore();
    const given = await giveOwnName(
      context,
      { firstName: '  Ana ', lastName: 'Made-up' },
      { ownNames: store },
    );
    expect(given).toEqual({ ok: true, value: { firstName: 'Ana', lastName: 'Made-up' } });
    expect([...store.names.keys()]).toEqual(['a1']);
  });

  it('is asked once: a second answer is refused and changes nothing', async () => {
    const store = memoryStore();
    await giveOwnName(context, { firstName: 'Ana', lastName: 'One' }, { ownNames: store });
    const again = await giveOwnName(
      context,
      { firstName: 'Bea', lastName: 'Two' },
      { ownNames: store },
    );
    expect(again).toEqual({ ok: false, error: { code: 'already-named' } });
    expect(store.names.get('a1')).toEqual({ firstName: 'Ana', lastName: 'One' });
  });

  it('refuses an empty or too long field, names which, and saves nothing', async () => {
    const store = memoryStore();
    const refused = await giveOwnName(
      context,
      { firstName: '   ', lastName: 'x'.repeat(101) },
      { ownNames: store },
    );
    expect(refused).toEqual({
      ok: false,
      error: { code: 'invalid-name', fields: ['firstName', 'lastName'] },
    });
    const one = await giveOwnName(context, { firstName: 'Ana' }, { ownNames: store });
    expect(one).toEqual({ ok: false, error: { code: 'invalid-name', fields: ['lastName'] } });
    expect(store.names.size).toBe(0);
  });
});
