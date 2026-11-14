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
import { setNameRequest } from './set-name-request.ts';

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

  it('refuses a scorekeeper, a visitor and a league that is archived', async () => {
    const { db, deps, as } = setUp();
    for (const who of [scorekeeperId, null, 'someone']) {
      expect(await setNameRequest(as(who), input(), deps)).toMatchObject({
        error: { code: 'not-allowed' },
      });
    }
    expect(db.state.people[0]?.visibility).toBe('none');
    const archived = setUp('archived');
    expect(await setNameRequest(archived.as(ownerId), input(), archived.deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
