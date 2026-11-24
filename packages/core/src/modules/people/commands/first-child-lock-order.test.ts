// T-403 (step 2.243): a new, a changed or a binned person takes the league's own row
// before the people store is asked anything, so for one league these saves and the
// other guarded ones (leagues/commands/first-child-lock-order.test.ts) take turns.
import { describe, expect, it } from 'vitest';
import type { CommandDeps } from '../../../command/ports.ts';
import { recordingTransaction, testDeps } from '../../../command/testing/memory-transaction.ts';
import { memoryPeople, ownerId as peopleOwner, person } from '../memory-people.test-helper.ts';
import type { PeopleTx } from '../ports.ts';
import { createPerson } from './create-person.ts';
import { removePerson } from './remove-person.ts';
import { updatePerson } from './update-person.ts';

/** The calls made of one store, from the first up to and with its one lock. */
function upToTheLock(calls: readonly string[], store: string, lock: string): string[] {
  const own = calls.filter((call) => call.startsWith(`${store}.`));
  expect(
    own.filter((call) => call === lock),
    own.join(', '),
  ).toHaveLength(1);
  return own.slice(0, own.indexOf(lock) + 1);
}

const adult = person(1, {
  sensitiveFields: { contactEmail: null, birthDate: null, isMinor: false },
});
const yesSaved = { 'privacy.childrenInFullConfirmed': true };

describe('the guarded people saves take the league row first (T-403)', () => {
  const saves: Record<
    string,
    (m: ReturnType<typeof memoryPeople>, deps: CommandDeps<PeopleTx>) => Promise<unknown>
  > = {
    'a new person': (m, deps) =>
      createPerson(
        m.as(peopleOwner),
        { firstName: 'Kid', lastName: 'One', birthDate: '2012-03-04' },
        deps,
      ),
    'a changed person': (m, deps) =>
      updatePerson(
        m.as(peopleOwner),
        { personId: adult.id, version: adult.version, isMinor: true },
        deps,
      ),
    'a person put in the bin': (m, deps) =>
      removePerson(m.as(peopleOwner), { personId: adult.id }, deps),
  };
  for (const [what, save] of Object.entries(saves)) {
    it(`${what}: the lock is the first thing the people store is asked`, async () => {
      const m = memoryPeople({
        status: 'live',
        audience: 'adult',
        settings: { ...yesSaved },
        people: [adult],
      });
      const calls: string[] = [];
      expect(await save(m, testDeps(recordingTransaction(m.transaction, calls)))).toMatchObject({
        ok: true,
      });
      expect(upToTheLock(calls, 'people', 'people.lockLeague')).toEqual(['people.lockLeague']);
    });
  }
});
