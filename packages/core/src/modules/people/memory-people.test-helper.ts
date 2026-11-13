// The people module's storage on plain objects, for core's command tests. The same
// commands run against the real database in packages/database (stores and the
// two-league harness).
import {
  memoryDatabase,
  memoryTransaction,
  testDeps,
} from '../../command/testing/memory-transaction.ts';
import type { ActivityEntry, Grant } from '../access/index.ts';
import type { PeopleTx, PersonRecord, PersonSensitiveFields } from './ports.ts';

/** A stored person: the record, and the sensitive fields kept beside it. */
export type StoredPerson = Omit<PersonRecord, 'sensitive'> & {
  sensitiveFields: PersonSensitiveFields;
  onRoster: boolean;
};

export type MemoryPeople = {
  status: string;
  people: StoredPerson[];
  grants: Grant[];
  activity: ActivityEntry[];
  /** Every read made with `sensitive: true`, so a test can see what was asked for. */
  sensitiveReads: number;
};

export const leagueId = '01900000-0000-7000-8000-000000000001';
export const ownerId = '01900000-0000-7000-8000-0000000000a1';
export const registrarId = '01900000-0000-7000-8000-0000000000a2';
export const scorekeeperId = '01900000-0000-7000-8000-0000000000a3';
export const personUuid = (n: number) =>
  `01900000-0000-7000-8000-0000000a${String(n).padStart(4, '0')}`;

export function person(n: number, fields: Partial<StoredPerson> = {}): StoredPerson {
  return {
    id: personUuid(n),
    firstName: `First${n}`,
    lastName: `Last${n}`,
    publicName: null,
    visibility: 'none',
    binned: false,
    version: 1,
    onRoster: false,
    sensitiveFields: { contactEmail: `p${n}@example.test`, birthDate: '2011-04-05', isMinor: true },
    ...fields,
  };
}

const grantOf = (id: string, accountId: string, role: Grant['role']): Grant => ({
  id: `01900000-0000-7000-8000-0000000000f${id}`,
  accountId,
  role,
  scope: { type: 'league' },
  grantedByAccountId: ownerId,
  revokedAt: null,
});

export const registrarGrant = grantOf('1', registrarId, 'registrar');
export const scorekeeperGrant = grantOf('2', scorekeeperId, 'scorekeeper');

export function memoryPeople(state: Partial<MemoryPeople> = {}) {
  const db = memoryDatabase<MemoryPeople>({
    status: 'draft',
    people: [],
    grants: [],
    activity: [],
    sensitiveReads: 0,
    ...state,
  });
  const transaction = memoryTransaction(db, (s, jobs): PeopleTx => {
    const view = (p: StoredPerson, sensitive: boolean): PersonRecord => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      publicName: p.publicName,
      visibility: p.visibility,
      binned: p.binned,
      version: p.version,
      ...(sensitive ? { sensitive: { ...p.sensitiveFields } } : {}),
    });
    return {
      jobs,
      access: {
        ownerAccountId: async () => ownerId,
        leagueStatus: async () => s.status,
        activeGrantsOf: async (account) =>
          s.grants.filter((g) => g.accountId === account && g.revokedAt === null),
      },
      activity: {
        record: async (entry) => void s.activity.push(entry),
        list: async () => [],
      },
      people: {
        find: async (id, sensitive) => {
          if (sensitive) s.sensitiveReads += 1;
          const found = s.people.find((p) => p.id === id);
          return found === undefined ? undefined : view(found, sensitive);
        },
        list: async ({ search, limit, offset, sensitive }) => {
          if (sensitive) s.sensitiveReads += 1;
          const needle = search?.toLowerCase();
          return s.people
            .filter((p) => !p.binned)
            .filter(
              (p) =>
                needle === undefined ||
                `${p.firstName} ${p.lastName} ${p.publicName ?? ''}`
                  .toLowerCase()
                  .includes(needle) ||
                (sensitive &&
                  (p.sensitiveFields.contactEmail ?? '').toLowerCase().includes(needle)),
            )
            .sort(
              (a, b) =>
                a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName),
            )
            .slice(offset, offset + limit)
            .map((p) => view(p, sensitive));
        },
        create: async (p) => {
          const id = personUuid(s.people.length + 1);
          s.people.push({
            id,
            firstName: p.firstName,
            lastName: p.lastName,
            publicName: p.publicName,
            visibility: 'none',
            binned: false,
            version: 1,
            onRoster: false,
            sensitiveFields: {
              contactEmail: p.contactEmail,
              birthDate: p.birthDate,
              isMinor: p.isMinor,
            },
          });
          return id;
        },
        update: async (id, change, version) => {
          const at = s.people.findIndex((p) => p.id === id);
          const found = s.people[at];
          if (found === undefined || found.binned || found.version !== version) return undefined;
          const { contactEmail, birthDate, isMinor, ...own } = change;
          s.people[at] = {
            ...found,
            ...own,
            sensitiveFields: {
              contactEmail:
                contactEmail === undefined ? found.sensitiveFields.contactEmail : contactEmail,
              birthDate: birthDate === undefined ? found.sensitiveFields.birthDate : birthDate,
              isMinor: isMinor === undefined ? found.sensitiveFields.isMinor : isMinor,
            },
            version: found.version + 1,
          };
          return found.version + 1;
        },
        setBinned: async (id, binned) => {
          const at = s.people.findIndex((p) => p.id === id);
          const found = s.people[at];
          if (found === undefined) return false;
          s.people[at] = { ...found, binned, version: found.version + 1 };
          return true;
        },
        isOnRoster: async (id) => s.people.find((p) => p.id === id)?.onRoster === true,
      },
    };
  });
  const deps = testDeps(transaction);
  const as = (account: string | null, league = leagueId) => ({
    leagueId: league,
    accountId: account,
    requestId: 'request-1',
  });
  return { db, deps, as, transaction };
}
