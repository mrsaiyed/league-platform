import { describe, expect, it } from 'vitest';
import {
  memoryPeople,
  ownerId,
  person,
  personUuid,
  registrarGrant,
  registrarId,
  scorekeeperGrant,
  scorekeeperId,
} from '../memory-people.test-helper.ts';
import { defaultNamePolicy, type NameRequest } from '../rules/name-policy.ts';
import { showName } from '../rules/show-name.ts';
import { publicViewer } from '../rules/viewer.ts';
import { setNameRequest } from './set-name-request.ts';
import { updatePerson } from './update-person.ts';

const setUp = (status = 'draft') =>
  memoryPeople({
    status,
    people: [person(1), person(2, { binned: true })],
    grants: [registrarGrant, scorekeeperGrant],
  });

const input = (extra: Record<string, unknown> = {}) => ({
  personId: personUuid(1),
  version: 1,
  showAs: 'removed',
  reason: 'guardianAsked',
  ...extra,
});

describe('setNameRequest (R-23)', () => {
  it("writes the person's request and logs it with the reason, in fixed words only", async () => {
    const { db, deps, as } = setUp();
    expect(await setNameRequest(as(ownerId), input(), deps)).toEqual({
      ok: true,
      value: { version: 2 },
    });
    expect(db.state.people[0]).toMatchObject({ visibility: 'removed', version: 2 });
    expect(db.state.activity).toMatchObject([
      {
        action: 'people.set_name_request',
        targetType: 'person',
        targetId: personUuid(1),
        details: { showAs: 'removed', reason: 'guardianAsked' },
      },
    ]);
    expect(JSON.stringify(db.state.activity)).not.toMatch(/First1|Last1|example\.test/);
  });

  it('lets a registrar set initials and go back to as the league shows everyone', async () => {
    const { db, deps, as } = setUp();
    const first = await setNameRequest(
      as(registrarId),
      input({ showAs: 'initials', reason: 'personAsked' }),
      deps,
    );
    expect(first).toEqual({ ok: true, value: { version: 2 } });
    const back = await setNameRequest(
      as(registrarId),
      input({ version: 2, showAs: 'none', reason: 'leagueDecided' }),
      deps,
    );
    expect(back).toEqual({ ok: true, value: { version: 3 } });
    expect(db.state.people[0]?.visibility).toBe('none');
  });

  it('changes nothing and logs nothing when the request is already that', async () => {
    const { db, deps, as } = setUp();
    expect(await setNameRequest(as(ownerId), input({ showAs: 'none' }), deps)).toEqual({
      ok: true,
      value: { version: 1 },
    });
    expect(db.state.activity).toEqual([]);
  });

  it('refuses a stale version (T-46), a binned person and a missing one', async () => {
    const { deps, as } = setUp();
    const codeOf = async (extra: Record<string, unknown>) => {
      const result = await setNameRequest(as(ownerId), input(extra), deps);
      return result.ok ? 'ok' : result.error.code;
    };
    expect(await codeOf({ version: 4 })).toBe('changed-since-read');
    expect(await codeOf({ personId: personUuid(2) })).toBe('person-not-found');
    expect(await codeOf({ personId: personUuid(9) })).toBe('person-not-found');
  });

  it('refuses an unknown choice, an unknown or typed reason, and no reason', async () => {
    const { deps, as } = setUp();
    for (const extra of [
      { showAs: 'hidden' },
      { reason: 'Her mother phoned on Tuesday' },
      { reason: undefined },
    ]) {
      expect(await setNameRequest(as(ownerId), input(extra), deps)).toMatchObject({
        error: { code: 'invalid-input' },
      });
    }
  });

  it('refuses a scorekeeper and a visitor', async () => {
    const { db, deps, as } = setUp();
    for (const who of [scorekeeperId, null, 'someone']) {
      expect(await setNameRequest(as(who), input(), deps)).toMatchObject({
        error: { code: 'not-allowed' },
      });
    }
    expect(db.state.people[0]?.visibility).toBe('none');
  });
});

/** A league with one child, one adult and one person of unknown age. */
function league(
  options: {
    audience?: 'adult' | 'youth' | 'mixed';
    settings?: Record<string, unknown>;
    status?: string;
  } = {},
) {
  const age = (isMinor: boolean | null) => ({
    contactEmail: null,
    birthDate: null,
    isMinor,
  });
  return memoryPeople({
    status: options.status ?? 'live',
    audience: options.audience ?? 'youth',
    settings: options.settings ?? {},
    people: [
      person(1, { sensitiveFields: age(true) }),
      person(2, { sensitiveFields: age(false) }),
      person(3, { sensitiveFields: age(null) }),
    ],
    grants: [registrarGrant, scorekeeperGrant],
  });
}
const child = personUuid(1);
const adult = personUuid(2);
const unknownAge = personUuid(3);
const ask = (personId: string, showAs: string, version = 1) => ({
  personId,
  version,
  showAs,
  reason: 'guardianAsked',
});
const codeOf = (result: { ok: boolean; error?: { code: string } }) =>
  result.ok ? 'ok' : result.error?.code;

describe('setNameRequest: initials for children always, for adults where offered (R-25)', () => {
  it("saves a child's initials in a full-names league with initials not offered", async () => {
    const { db, deps, as } = league({ settings: { 'privacy.publicNames': 'fullName' } });
    expect(codeOf(await setNameRequest(as(ownerId), ask(child, 'initials'), deps))).toBe('ok');
    expect(db.state.people[0]?.visibility).toBe('initials');
  });

  it('saves initials for a person of unknown age in a youth or mixed league', async () => {
    for (const audience of ['youth', 'mixed'] as const) {
      const { db, deps, as } = league({ audience });
      expect(codeOf(await setNameRequest(as(ownerId), ask(unknownAge, 'initials'), deps))).toBe(
        'ok',
      );
      expect(db.state.people[2]?.visibility, audience).toBe('initials');
    }
  });

  it("refuses an adult's initials where the league does not offer them, and logs nothing", async () => {
    for (const [who, audience] of [
      [adult, 'youth'],
      [adult, 'adult'],
      // In an adult league a person of unknown age counts as an adult (R-15).
      [unknownAge, 'adult'],
    ] as const) {
      const { db, deps, as } = league({ audience });
      expect(await setNameRequest(as(registrarId), ask(who, 'initials'), deps)).toEqual({
        ok: false,
        error: { code: 'initials-not-offered' },
      });
      expect(db.state.people.map((p) => p.visibility)).toEqual(['none', 'none', 'none']);
      expect(db.state.activity).toEqual([]);
    }
  });

  it("saves an adult's initials where the league lets adults ask", async () => {
    const { db, deps, as } = league({
      audience: 'adult',
      settings: { 'privacy.playersMayAskForInitials': true },
    });
    expect(codeOf(await setNameRequest(as(ownerId), ask(adult, 'initials'), deps))).toBe('ok');
    expect(db.state.people[1]?.visibility).toBe('initials');
  });

  it('asks the store whether the person is a child (R-28), reading no private field', async () => {
    const facts = (birthDate: string, isMinor: boolean) => ({
      contactEmail: null,
      birthDate,
      isMinor,
    });
    const { db, deps, as } = memoryPeople({
      status: 'live',
      audience: 'adult',
      today: '2026-11-16',
      people: [
        // A child by the date, the tick off: initials always (R-25).
        person(1, { sensitiveFields: facts('2012-09-03', false) }),
        // An adult by the date, the tick off: initials only where offered (R-15).
        person(2, { sensitiveFields: facts('1990-04-12', false) }),
        // Eighteen tomorrow, in the league's own day: still a child today.
        person(3, { sensitiveFields: facts('2008-11-17', false) }),
        // An adult by the date, the tick on: a child, whom the admin unticks to show more.
        person(4, { sensitiveFields: facts('1990-04-12', true) }),
      ],
      grants: [registrarGrant],
    });
    expect(codeOf(await setNameRequest(as(registrarId), ask(child, 'initials'), deps))).toBe('ok');
    expect(await setNameRequest(as(registrarId), ask(adult, 'initials'), deps)).toEqual({
      ok: false,
      error: { code: 'initials-not-offered' },
    });
    expect(codeOf(await setNameRequest(as(registrarId), ask(unknownAge, 'initials'), deps))).toBe(
      'ok',
    );
    expect(
      codeOf(await setNameRequest(as(registrarId), ask(personUuid(4), 'initials'), deps)),
    ).toBe('ok');
    expect(db.state.people.map((p) => p.visibility)).toEqual([
      'initials',
      'none',
      'initials',
      'initials',
    ]);
    // The birth dates stayed in the store.
    expect(db.state.sensitiveReads).toBe(0);
  });

  it('always saves removed, for anyone, whatever the settings (R-17)', async () => {
    const { db, deps, as } = league({ audience: 'adult' });
    for (const [i, who] of [child, adult, unknownAge].entries()) {
      expect(codeOf(await setNameRequest(as(ownerId), ask(who, 'removed'), deps))).toBe('ok');
      expect(db.state.people[i]?.visibility).toBe('removed');
    }
  });
});

describe('a recorded request keeps taking effect (R-27)', () => {
  /** How the person shows on a public page now, from what is stored. */
  const shownNow = (
    stored: { firstName: string; lastName: string; visibility: string },
    isMinor: boolean | null,
    audience: 'adult' | 'youth',
    playersMayAskForInitials: boolean,
  ) =>
    showName(
      {
        firstName: stored.firstName,
        lastName: stored.lastName,
        isMinor,
        nameRequest: stored.visibility as NameRequest,
      },
      {
        audience,
        policy: { ...defaultNamePolicy, playersMayAskForInitials },
        viewer: publicViewer('L1'),
        statsOf: null,
      },
    );

  it("keeps an adult's initials after the league switches asking off", async () => {
    const m = league({ audience: 'adult', settings: { 'privacy.playersMayAskForInitials': true } });
    expect(codeOf(await setNameRequest(m.as(ownerId), ask(adult, 'initials'), m.deps))).toBe('ok');
    m.db.state.settings = { 'privacy.playersMayAskForInitials': false };
    const stored = m.db.state.people[1];
    if (stored === undefined) throw new Error('expected the person');
    expect(shownNow(stored, false, 'adult', false)).toEqual({ shown: true, text: 'F. L.' });
    // Saving what they already have is not a new request: allowed, nothing changes.
    expect(await setNameRequest(m.as(ownerId), ask(adult, 'initials', 2), m.deps)).toEqual({
      ok: true,
      value: { version: 2 },
    });
    expect(m.db.state.activity).toHaveLength(1);
    // A new request for an adult is still refused while asking is off.
    expect(await setNameRequest(m.as(ownerId), ask(unknownAge, 'initials'), m.deps)).toEqual({
      ok: false,
      error: { code: 'initials-not-offered' },
    });
  });

  it("keeps a child's initials after their age makes them an adult", async () => {
    const m = league({ audience: 'adult' });
    expect(codeOf(await setNameRequest(m.as(ownerId), ask(child, 'initials'), m.deps))).toBe('ok');
    const grownUp = await updatePerson(
      m.as(ownerId),
      { personId: child, version: 2, isMinor: false, birthDate: '2000-01-01' },
      m.deps,
    );
    expect(grownUp).toEqual({ ok: true, value: { version: 3 } });
    const stored = m.db.state.people[0];
    if (stored === undefined) throw new Error('expected the person');
    expect(stored.visibility).toBe('initials');
    expect(shownNow(stored, false, 'adult', false)).toEqual({ shown: true, text: 'F. L.' });
    expect(await setNameRequest(m.as(ownerId), ask(child, 'initials', 3), m.deps)).toEqual({
      ok: true,
      value: { version: 3 },
    });
  });
});

describe('setNameRequest in a read-only league (R-26)', () => {
  it.each(['archived', 'suspended'])(
    'lets a request show less of the person in a league that is %s',
    async (status) => {
      const { db, deps, as } = league({ status });
      expect(codeOf(await setNameRequest(as(ownerId), ask(child, 'initials'), deps))).toBe('ok');
      expect(codeOf(await setNameRequest(as(ownerId), ask(child, 'removed', 2), deps))).toBe('ok');
      expect(codeOf(await setNameRequest(as(registrarId), ask(adult, 'removed'), deps))).toBe('ok');
      expect(db.state.people.map((p) => p.visibility)).toEqual(['removed', 'removed', 'none']);
      expect(db.state.activity).toHaveLength(3);
    },
  );

  it.each(['archived', 'suspended'])(
    'refuses a request that shows more in a league that is %s',
    async (status) => {
      const { db, deps, as } = league({ status });
      db.state.people[0] = { ...db.state.people[0]!, visibility: 'removed' };
      db.state.people[1] = { ...db.state.people[1]!, visibility: 'initials' };
      for (const change of [ask(child, 'initials'), ask(child, 'none'), ask(adult, 'none')]) {
        expect(await setNameRequest(as(ownerId), change, deps)).toMatchObject({
          error: { code: 'not-allowed' },
        });
      }
      expect(db.state.people.map((p) => p.visibility)).toEqual(['removed', 'initials', 'none']);
      expect(db.state.activity).toEqual([]);
    },
  );

  // Step 2.146's closing round (Low 11): "An adult" shows more, so it is refused as a
  // request that shows more is; so is every other change of a person's details (U-9).
  it.each(['archived', 'suspended'])(
    'refuses "An adult" and every change of details in a league that is %s',
    async (status) => {
      const { db, deps, as } = league({ status });
      for (const change of [
        { personId: unknownAge, version: 1, isMinor: false },
        { personId: child, version: 1, isMinor: false },
        { personId: child, version: 1, birthDate: '1990-04-12' },
        { personId: adult, version: 1, firstName: 'Renamed' },
      ]) {
        expect(await updatePerson(as(ownerId), change, deps)).toMatchObject({
          error: { code: 'not-allowed' },
        });
      }
      expect(db.state.people.map((p) => p.sensitiveFields.isMinor)).toEqual([true, false, null]);
      expect(db.state.activity).toEqual([]);
    },
  );

  it.each(['archived', 'suspended'])(
    'still refuses a scorekeeper in a league that is %s',
    async (status) => {
      const { deps, as } = league({ status });
      expect(await setNameRequest(as(scorekeeperId), ask(child, 'removed'), deps)).toMatchObject({
        error: { code: 'not-allowed' },
      });
    },
  );
});

describe("people.update_person never writes a person's request", () => {
  it('ignores a visibility field, and refuses one sent alone', async () => {
    const { db, deps, as } = league();
    expect(
      await updatePerson(
        as(ownerId),
        { personId: child, version: 1, firstName: 'Renamed', visibility: 'removed' },
        deps,
      ),
    ).toEqual({ ok: true, value: { version: 2 } });
    expect(db.state.people[0]).toMatchObject({ firstName: 'Renamed', visibility: 'none' });
    expect(
      await updatePerson(as(ownerId), { personId: child, version: 2, visibility: 'removed' }, deps),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(db.state.people[0]?.visibility).toBe('none');
  });
});
