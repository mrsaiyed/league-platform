// Admin → People (step 2.50): a role that may read the league list but not the private
// details (`people.read` without `people.read_sensitive`, R-16, T-76) gets a record with
// no private field, and its page draws none. No role in the fixed table is like that, so
// this file denies the one permission in core's access module for its own test.
import { createPerson, type AccessReader, type CommandContext, type Grant } from '@srleagues/core';
import { describe, expect, it, vi } from 'vitest';
import { standInPeople } from '../../server/stand-in-cast.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
import { readPerson } from './people-view.ts';
import { newPersonInput } from './person-input.ts';

type HasPermission = (...args: readonly unknown[]) => Promise<boolean>;
const denied = vi.hoisted(() => new Set<unknown>());
vi.mock('../../../../../packages/core/src/modules/access/index.ts', async (importOriginal) => {
  const real = await importOriginal<{ readonly hasPermission: HasPermission }>();
  const hasPermission: HasPermission = (...args) =>
    denied.has(args[2]) ? Promise.resolve(false) : real.hasPermission(...args);
  return { ...real, hasPermission };
});

const leagueId = '01900000-0000-7000-8000-000000000001';
const ownerId = standInPeople.owner.accountId;
const registrar = '01900000-0000-7000-8000-0000000000ee';
const grants: Grant[] = [
  {
    id: '01900000-0000-7000-8000-0000000000ef',
    accountId: registrar,
    role: 'registrar',
    scope: { type: 'league' },
    grantedByAccountId: ownerId,
    revokedAt: null,
  },
];
const access: AccessReader = {
  ownerAccountId: async () => ownerId,
  leagueStatus: async () => 'live',
  activeGrantsOf: async (accountId) => grants.filter((g) => g.accountId === accountId),
};
const as = (accountId: string): CommandContext => ({ leagueId, accountId, requestId: 'r-1' });

describe('a role that may read people but not their private details', () => {
  it('gets a record with no sensitive key, and its page has no private details', async () => {
    const world = testWorld(() => access);
    const made = await createPerson(
      as(ownerId),
      newPersonInput({
        firstName: 'Jon',
        lastName: 'Smiht',
        contactEmail: 'jon.parent@example.test',
        birthDate: '2014-06-01',
        child: 'child',
      }),
      world.deps,
    );
    if (!made.ok) throw new Error(`refused: ${made.error.code}`);
    denied.add('people.read_sensitive');
    try {
      const read = await readPerson(as(registrar), made.value.personId, world.deps);
      expect(read.ok).toBe(true);
      if (!read.ok) return;
      expect(Object.hasOwn(read.person, 'private')).toBe(false);
      // readPerson draws the page's view with personViewOf, from what getPerson read.
      expect(JSON.stringify(read.person)).not.toMatch(/jon\.parent|2014-06-01/);
    } finally {
      denied.clear();
    }
  });
});
