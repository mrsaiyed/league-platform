// Admin → People (step 2.50): what each page reads and holds, role by role, on the one
// made-up world the app runs on (the real people commands over its rows), and how a
// person's form becomes the commands' input.
import {
  createPerson,
  roles,
  type AccessReader,
  type CommandContext,
  type Grant,
  type Role,
} from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { standInPeople } from '../../server/stand-in-cast.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
import { peopleAskOf, personViewOf, readPeopleList, readPerson } from './people-view.ts';
import { newPersonInput, personChangeInput, wrongBoxes } from './person-input.ts';

const leagueId = '01900000-0000-7000-8000-000000000001';
const ownerId = standInPeople.owner.accountId;
const someone = '01900000-0000-7000-8000-0000000000ee';

/** The made-up world where `someone` holds `role` in the first league (none: holds nothing). */
function worldWith(role: Role | 'none') {
  const grants: Grant[] =
    role === 'none'
      ? []
      : [
          {
            id: '01900000-0000-7000-8000-0000000000ef',
            accountId: someone,
            role,
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
  return testWorld(() => access);
}

const as = (accountId: string | null): CommandContext => ({
  leagueId,
  accountId,
  requestId: 'request-1',
});

/** A child added by hand, with an email and a date of birth, as the owner adds them. */
async function aChild(world: ReturnType<typeof worldWith>): Promise<string> {
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
  return made.value.personId;
}

const privateWords = /jon\.parent@example\.test|2014-06-01|contactEmail|birthDate|"child"/;

describe('what Admin → People reads, role by role (R-16, T-76)', () => {
  // The roles that hold people.read_sensitive, and everyone else, who is not let in.
  const sees: readonly (Role | 'owner')[] = ['owner', 'admin', 'registrar'];
  const refused = [...roles.filter((role) => !sees.includes(role)), 'none' as const];

  for (const role of sees) {
    it(`gives ${role === 'owner' ? 'the owner' : `a ${role}`} the person's private details on their record only`, async () => {
      const world = worldWith(role === 'owner' ? 'none' : role);
      const personId = await aChild(world);
      const viewer = as(role === 'owner' ? ownerId : someone);
      const record = await readPerson(viewer, personId, world.deps);
      expect(record).toMatchObject({
        ok: true,
        person: {
          name: 'Jon Smiht',
          private: {
            contactEmail: 'jon.parent@example.test',
            birthDate: '2014-06-01',
            child: 'child',
          },
        },
      });
      // The list holds names only, for every role: no private detail is in its data.
      const list = await readPeopleList(viewer, peopleAskOf({ q: 'smiht' }), world.deps);
      expect(list).toMatchObject({ ok: true, rows: [{ id: personId, name: 'Jon Smiht' }] });
      expect(JSON.stringify(list)).not.toMatch(privateWords);
    });
  }

  for (const role of refused) {
    it(`gives ${role === 'none' ? 'someone with no role' : `a ${role}`} nothing of the list or the record`, async () => {
      const world = worldWith(role);
      const personId = await aChild(world);
      const record = await readPerson(as(someone), personId, world.deps);
      const list = await readPeopleList(as(someone), peopleAskOf({}), world.deps);
      expect(record).toEqual({ ok: false, code: 'not-allowed' });
      expect(list).toEqual({ ok: false, code: 'not-allowed' });
    });
  }

  it('gives a visitor nothing', async () => {
    const world = worldWith('none');
    const personId = await aChild(world);
    expect(await readPerson(as(null), personId, world.deps)).toEqual({
      ok: false,
      code: 'not-allowed',
    });
  });

  it('draws no private box from a record read without them: the key is absent, not empty', () => {
    const view = personViewOf({
      id: someone,
      firstName: 'Jon',
      lastName: 'Smith',
      publicName: null,
      visibility: 'none',
      binned: false,
      version: 2,
    });
    expect(view).toEqual({
      id: someone,
      version: 2,
      firstName: 'Jon',
      lastName: 'Smith',
      name: 'Jon Smith',
      visibility: 'none',
    });
    expect(JSON.stringify(view)).not.toMatch(/private|email|birth|child/i);
  });

  it('lists the players of a team in the bin, and pages fifty at a time', async () => {
    const world = worldWith('none');
    for (let n = 1; n <= 60; n += 1) {
      await createPerson(
        as(ownerId),
        newPersonInput({ firstName: `P${n}`, lastName: 'Zz' }),
        world.deps,
      );
    }
    const first = await readPeopleList(as(ownerId), peopleAskOf({ q: 'zz' }), world.deps);
    const second = await readPeopleList(
      as(ownerId),
      peopleAskOf({ q: 'zz', page: '2' }),
      world.deps,
    );
    expect(first.ok && [first.rows.length, first.more]).toEqual([50, true]);
    expect(second.ok && [second.rows.length, second.more]).toEqual([10, false]);
  });
});

describe('the list address', () => {
  it('searches a name, and never an email address, which would sit in the address', () => {
    expect(peopleAskOf({ q: '  Smi ' })).toEqual({
      search: 'Smi',
      emailRefused: false,
      page: 1,
      tickedButGrown: false,
    });
    // Step 2.146: the finder of those ticked as children who are 18 or over.
    expect(peopleAskOf({ ticked: 'grown' }).tickedButGrown).toBe(true);
    expect(peopleAskOf({ ticked: 'yes' }).tickedButGrown).toBe(false);
    expect(peopleAskOf({ q: 'jon@example.test' })).toEqual({
      search: undefined,
      emailRefused: true,
      page: 1,
      tickedButGrown: false,
    });
  });
  it('takes a page from 1, and anything else as the first', () => {
    expect(peopleAskOf({ page: '3' }).page).toBe(3);
    for (const page of ['0', '-1', 'two', '1.5']) expect(peopleAskOf({ page }).page).toBe(1);
  });
});

describe("a person's form", () => {
  it('marks the boxes that are wrong, in the form order', () => {
    expect(
      wrongBoxes(
        {
          firstName: '',
          lastName: 'Smith',
          contactEmail: 'no-at-sign',
          birthDate: '2999-01-01',
          child: 'maybe',
        },
        '2026-11-16',
      ),
    ).toEqual(['firstName', 'contactEmail', 'birthDate', 'child']);
    expect(
      wrongBoxes(
        { firstName: 'Jon', lastName: 'Smith', contactEmail: '', birthDate: '' },
        '2026-11-16',
      ),
    ).toEqual([]);
  });

  it('adds someone with a name only, on no team, with no private detail unless typed', () => {
    expect(
      newPersonInput({ firstName: 'Jon', lastName: 'Smith', contactEmail: ' ', birthDate: '' }),
    ).toEqual({
      firstName: 'Jon',
      lastName: 'Smith',
    });
    expect(
      newPersonInput({
        firstName: 'Jon',
        lastName: 'Smith',
        contactEmail: 'j@example.test',
        child: 'adult',
      }),
    ).toEqual({
      firstName: 'Jon',
      lastName: 'Smith',
      contactEmail: 'j@example.test',
      isMinor: false,
    });
  });

  it('changes only what the form posted, an emptied box clearing it', () => {
    expect(
      personChangeInput({
        personId: someone,
        version: '4',
        firstName: 'Jon',
        lastName: 'Smith',
        contactEmail: '',
        birthDate: '',
        child: '',
      }),
    ).toEqual({
      personId: someone,
      version: 4,
      firstName: 'Jon',
      lastName: 'Smith',
      contactEmail: null,
      birthDate: null,
      isMinor: null,
    });
    // A form drawn without the private boxes (R-16) posts none, and none is changed.
    expect(
      personChangeInput({ personId: someone, version: '4', firstName: 'Jon', lastName: 'Smith' }),
    ).toEqual({ personId: someone, version: 4, firstName: 'Jon', lastName: 'Smith' });
  });

  it('sends only the boxes this person changed, so a save sent again clears nothing someone else saved', () => {
    // Tab B fixed the first name; meanwhile tab A marked him a child and gave an email.
    // B's form says what each box held when it was drawn (now: what is stored), and only
    // the first name differs from it.
    expect(
      personChangeInput({
        personId: someone,
        version: '5',
        firstName: 'Jonathan',
        'was.firstName': 'Jon',
        lastName: 'Smithson',
        'was.lastName': 'Smithson',
        contactEmail: 'guardian@example.test',
        'was.contactEmail': 'guardian@example.test',
        birthDate: '',
        'was.birthDate': '',
        child: 'child',
        'was.child': 'child',
      }),
    ).toEqual({ personId: someone, version: 5, firstName: 'Jonathan' });
    // Nothing changed: the first name as it stands, which changes nothing.
    expect(
      personChangeInput({
        personId: someone,
        version: '5',
        firstName: 'Jon',
        'was.firstName': 'Jon',
        child: '',
        'was.child': '',
      }),
    ).toEqual({ personId: someone, version: 5, firstName: 'Jon' });
  });
});
