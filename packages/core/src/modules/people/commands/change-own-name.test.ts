import { describe, expect, it } from 'vitest';
import type { OwnName, OwnNameStore } from '../own-name.ts';

import { changeOwnName } from './change-own-name.ts';
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

describe('changeOwnName (step 2.128)', () => {
  it('changes the name of an account that has given one', async () => {
    const store = memoryStore();
    await giveOwnName(context, { firstName: 'Ana', lastName: 'One' }, { ownNames: store });
    const changed = await changeOwnName(
      context,
      { firstName: 'Ana', lastName: ' Two ' },
      { ownNames: store },
    );
    expect(changed).toEqual({ ok: true, value: { firstName: 'Ana', lastName: 'Two' } });
    expect(store.names.get('a1')).toEqual({ firstName: 'Ana', lastName: 'Two' });
  });

  it('refuses before the name was ever given, and a bad field keeps the old name', async () => {
    const store = memoryStore();
    expect(
      await changeOwnName(context, { firstName: 'A', lastName: 'B' }, { ownNames: store }),
    ).toEqual({ ok: false, error: { code: 'no-name-yet' } });
    await giveOwnName(context, { firstName: 'Ana', lastName: 'One' }, { ownNames: store });
    const refused = await changeOwnName(
      context,
      { firstName: '', lastName: 'Two' },
      { ownNames: store },
    );
    expect(refused).toEqual({ ok: false, error: { code: 'invalid-name', fields: ['firstName'] } });
    expect(store.names.get('a1')).toEqual({ firstName: 'Ana', lastName: 'One' });
  });
});
