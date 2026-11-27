import { describe, expect, it } from 'vitest';
import { audiences, type Audience } from '../../leagues/index.ts';
import {
  defaultNamePolicy,
  nameForms,
  nameRequests,
  type NamePolicy,
  type NameRequest,
} from './name-policy.ts';
import { numberInPlace, showName, type PersonForDisplay, type ShownName } from './show-name.ts';
import { statsVisibilities, type TeamStatsSetting } from './stats-shown.ts';
import { publicViewer, type Viewer } from './viewer.ts';

const leagueId = 'league-1';
const teamId = 'team-a';

function person(overrides: Partial<PersonForDisplay> = {}): PersonForDisplay {
  return {
    firstName: 'Amina',
    lastName: 'Yusuf',
    isMinor: null,
    nameRequest: 'none',
    ...overrides,
  };
}

function where(
  audience: Audience,
  policy: Partial<NamePolicy> = {},
  extra: { viewer?: Viewer; statsOf?: TeamStatsSetting } = {},
) {
  return {
    audience,
    policy: { ...defaultNamePolicy, ...policy },
    viewer: extra.viewer ?? publicViewer(leagueId),
    statsOf: extra.statsOf ?? null,
  };
}

const named = (text: string): ShownName => ({ shown: true, text });

/** Every league's start: full names, the confirmation not given (record 065). */
const adultStart: Partial<NamePolicy> = { names: 'full_name', childrenInFull: false };
/** Full names chosen and confirmed (R-14). */
const confirmedFull: Partial<NamePolicy> = { names: 'full_name', childrenInFull: true };

describe('showName: the league display policy (R-14, R-15, R-24, R-29)', () => {
  it('shows children in a youth league by first name and last initial to start with', () => {
    expect(showName(person({ isMinor: true }), where('youth'))).toEqual(named('Amina Y.'));
  });

  it('treats a youth league player of unknown age as a child', () => {
    expect(showName(person(), where('youth'))).toEqual(named('Amina Y.'));
    expect(showName(person(), where('mixed'))).toEqual(named('Amina Y.'));
  });

  it('shows a known adult in a youth league by full name to start with, and less once chosen (R-15, R-29)', () => {
    expect(showName(person({ isMinor: false }), where('youth'))).toEqual(named('Amina Yusuf'));
    expect(
      showName(person({ isMinor: false }), where('youth', { names: 'first_name_last_initial' })),
    ).toEqual(named('Amina Y.'));
  });

  it('shows children by full name once the admin switches to it and confirms (R-14)', () => {
    expect(showName(person(), where('youth', confirmedFull))).toEqual(named('Amina Yusuf'));
    // Full names without the confirmation: a child stays at first name and last initial.
    expect(showName(person(), where('youth', adultStart))).toEqual(named('Amina Y.'));
  });

  it('shows adults by full name at the start of an adult league, and a child with care', () => {
    expect(showName(person(), where('adult', adultStart))).toEqual(named('Amina Yusuf'));
    expect(showName(person({ isMinor: true }), where('adult', adultStart))).toEqual(
      named('Amina Y.'),
    );
    expect(showName(person({ isMinor: true }), where('adult', confirmedFull))).toEqual(
      named('Amina Yusuf'),
    );
  });

  it("follows an adult league's choice of less for every adult (R-29)", () => {
    expect(showName(person(), where('adult', { names: 'first_name_last_initial' }))).toEqual(
      named('Amina Y.'),
    );
    expect(showName(person({ isMinor: false }), where('adult', { names: 'hidden' }))).toEqual({
      shown: false,
      why: 'hidden',
    });
  });

  it("keeps honouring an adult's recorded initials, whatever the switch now says (R-27)", () => {
    const asked = person({ nameRequest: 'initials' });
    expect(
      showName(asked, where('adult', { ...adultStart, playersMayAskForInitials: true })),
    ).toEqual(named('A. Y.'));
    // The league switched asking off after the request was recorded: it still holds.
    expect(showName(asked, where('adult', adultStart))).toEqual(named('A. Y.'));
    // A child who asked and has since been recorded as an adult: it still holds.
    expect(showName(person({ isMinor: false, nameRequest: 'initials' }), where('youth'))).toEqual(
      named('A. Y.'),
    );
    // Someone who did not ask is shown by full name.
    expect(showName(person(), where('adult', adultStart))).toEqual(named('Amina Yusuf'));
    // Initials never show more than the league's "hidden", for an adult too (R-25, R-29).
    expect(showName(asked, where('adult', { names: 'hidden' }))).toEqual({
      shown: false,
      why: 'hidden',
    });
  });

  it("always honours a child's request for initials, whatever the league's settings (R-25)", () => {
    const asked = person({ nameRequest: 'initials' });
    // Unknown age in a youth or mixed league counts as a child; a known child anywhere.
    for (const [who, audience] of [
      [asked, 'youth'],
      [asked, 'mixed'],
      [person({ isMinor: true, nameRequest: 'initials' }), 'adult'],
    ] as const) {
      const initialOnly: Partial<NamePolicy> = { names: 'first_name_last_initial' };
      for (const policy of [confirmedFull, adultStart, initialOnly]) {
        expect(showName(who, where(audience, policy)), `${audience} ${policy.names}`).toEqual(
          named('A. Y.'),
        );
      }
      // Asking for initials never shows more than the league's "hidden".
      expect(showName(who, where(audience, { names: 'hidden' }))).toEqual({
        shown: false,
        why: 'hidden',
      });
    }
  });

  it('hides everyone by name, not by number, when the league chooses hidden (R-24, R-29)', () => {
    const hidden = where('youth', { names: 'hidden' });
    expect(showName(person(), hidden)).toEqual({ shown: false, why: 'hidden' });
    expect(showName(person({ isMinor: true }), where('adult', { names: 'hidden' }))).toEqual({
      shown: false,
      why: 'hidden',
    });
    expect(showName(person({ isMinor: false }), hidden)).toEqual({ shown: false, why: 'hidden' });
    expect(showName(person(), where('adult', { names: 'hidden' }))).toEqual({
      shown: false,
      why: 'hidden',
    });
    // A form it does not know shows the least.
    const odd = where('youth', { names: 'everything' as unknown as 'hidden' });
    expect(showName(person({ isMinor: false }), odd)).toEqual({ shown: false, why: 'hidden' });
  });

  it('counts anything but a plain true as no confirmation (R-14)', () => {
    for (const odd of ['true', 1, 'yes', null, undefined]) {
      const policy = { names: 'full_name' as const, childrenInFull: odd as unknown as boolean };
      expect(showName(person({ isMinor: true }), where('youth', policy)), String(odd)).toEqual(
        named('Amina Y.'),
      );
    }
  });

  it('leaves a name off when the person asked for it to be taken off (R-17)', () => {
    expect(showName(person({ nameRequest: 'removed' }), where('adult', adultStart))).toEqual({
      shown: false,
      why: 'removed',
    });
  });

  it('tidies spaces and handles missing or accented parts', () => {
    expect(
      showName(
        person({ firstName: '  Amina ', lastName: ' de  la Cruz ' }),
        where('adult', adultStart),
      ),
    ).toEqual(named('Amina de la Cruz'));
    expect(showName(person({ lastName: 'de la Cruz' }), where('youth'))).toEqual(named('Amina D.'));
    expect(showName(person({ firstName: 'Ömer', lastName: 'Çelik' }), where('youth'))).toEqual(
      named('Ömer Ç.'),
    );
    expect(showName(person({ lastName: '' }), where('youth'))).toEqual(named('Amina'));
    expect(showName(person({ firstName: '' }), where('youth'))).toEqual(named('Y.'));
    expect(showName(person({ firstName: ' ', lastName: '' }), where('adult'))).toEqual({
      shown: false,
      why: 'no_name',
    });
  });
});

describe('showName: who sees statistics (S-22, T-87)', () => {
  const staffOnly: TeamStatsSetting = { leagueId, teamId, statsVisibility: 'staff' };

  it("drops a staff-only team's player names beside its numbers for the public", () => {
    expect(showName(person(), where('adult', {}, { statsOf: staffOnly }))).toEqual({
      shown: false,
      why: 'restricted',
    });
  });

  it("still names the team's players on a roster, where no numbers are shown", () => {
    expect(showName(person(), where('adult', adultStart))).toEqual(named('Amina Yusuf'));
  });

  it("names them for the team's staff and the league's admins", () => {
    const staff: Viewer = { leagueId, leagueAdmin: false, staffOfTeamIds: [teamId] };
    const admin: Viewer = { leagueId, leagueAdmin: true, staffOfTeamIds: [] };
    expect(
      showName(person(), where('adult', adultStart, { statsOf: staffOnly, viewer: staff })),
    ).toEqual(named('Amina Yusuf'));
    expect(showName(person(), where('youth', {}, { statsOf: staffOnly, viewer: admin }))).toEqual(
      named('Amina Y.'),
    );
  });
});

describe('showName: every combination of policy, setting and viewer', () => {
  const viewers: ReadonlyArray<readonly [string, Viewer, boolean]> = [
    ['the public', publicViewer(leagueId), false],
    ["another team's staff", { leagueId, leagueAdmin: false, staffOfTeamIds: ['team-b'] }, false],
    ["the team's staff", { leagueId, leagueAdmin: false, staffOfTeamIds: [teamId] }, true],
    ['a league admin', { leagueId, leagueAdmin: true, staffOfTeamIds: [] }, true],
  ];
  const settings: ReadonlyArray<TeamStatsSetting | undefined> = [
    undefined,
    ...statsVisibilities.map((statsVisibility) => ({ leagueId, teamId, statsVisibility })),
  ];
  const ages: ReadonlyArray<boolean | null> = [true, false, null];

  /** The rules in plain words, written separately from the function. */
  function expected(
    audience: Audience,
    policy: NamePolicy,
    isMinor: boolean | null,
    request: NameRequest,
    setting: TeamStatsSetting | undefined,
    mayViewStaffOnly: boolean,
  ): ShownName {
    if (setting?.statsVisibility === 'staff' && !mayViewStaffOnly) {
      return { shown: false, why: 'restricted' };
    }
    if (request === 'removed') return { shown: false, why: 'removed' };
    // The league's choice, followed for everyone (R-24, R-29).
    if (policy.names === 'hidden') return { shown: false, why: 'hidden' };
    // A recorded request holds whatever the switch or the age now say (R-25, R-27).
    if (request === 'initials') return named('A. Y.');
    if (policy.names === 'first_name_last_initial') return named('Amina Y.');
    // Full names: a child only once confirmed (R-14).
    const child = isMinor === true || (isMinor === null && audience !== 'adult');
    return child && !policy.childrenInFull ? named('Amina Y.') : named('Amina Yusuf');
  }

  it('matches the rules for all of them', () => {
    const mismatches: string[] = [];
    let count = 0;
    for (const audience of audiences)
      for (const names of nameForms)
        for (const childrenInFull of [false, true])
          for (const playersMayAskForInitials of [false, true])
            for (const isMinor of ages)
              for (const nameRequest of nameRequests)
                for (const setting of settings)
                  for (const [who, viewer, mayViewStaffOnly] of viewers) {
                    count += 1;
                    const policy: NamePolicy = { names, childrenInFull, playersMayAskForInitials };
                    const got = showName(person({ isMinor, nameRequest }), {
                      audience,
                      policy,
                      viewer,
                      statsOf: setting ?? null,
                    });
                    const want = expected(
                      audience,
                      policy,
                      isMinor,
                      nameRequest,
                      setting,
                      mayViewStaffOnly,
                    );
                    if (JSON.stringify(got) !== JSON.stringify(want)) {
                      mismatches.push(
                        `${audience} ${names} confirmed=${String(childrenInFull)} ` +
                          `ask=${String(playersMayAskForInitials)} ` +
                          `minor=${String(isMinor)} ${nameRequest} ` +
                          `${setting?.statsVisibility ?? 'no stats'} ${who}: ` +
                          `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
                      );
                    }
                  }
    expect(mismatches).toEqual([]);
    expect(count).toBe(3 * 3 * 2 * 2 * 3 * 3 * 3 * 4);
  });

  it("never shows a child's full surname unconfirmed, nor under an initials request", () => {
    for (const audience of audiences)
      for (const names of nameForms)
        for (const isMinor of ages)
          for (const nameRequest of nameRequests) {
            const result = showName(
              person({ isMinor, nameRequest }),
              where(audience, { names, childrenInFull: false }),
            );
            const child = isMinor === true || (isMinor === null && audience !== 'adult');
            if ((child || nameRequest === 'initials') && result.shown) {
              expect(result.text).not.toContain('Yusuf');
            }
          }
  });
});

describe('showName: fails closed on values it does not know', () => {
  it('counts an isMinor that is neither true nor false as not known', () => {
    for (const odd of ['true', 'false', 0, 1, undefined, 'yes']) {
      const p = person({ isMinor: odd as unknown as boolean | null });
      expect(showName(p, where('youth')), String(odd)).toEqual(named('Amina Y.'));
      expect(showName(p, where('mixed')), String(odd)).toEqual(named('Amina Y.'));
      expect(showName(p, where('adult', adultStart)), String(odd)).toEqual(named('Amina Yusuf'));
    }
  });

  it('counts an unknown name request as a request to be taken off (R-17)', () => {
    for (const odd of ['hidden', 'NONE', '', null, undefined]) {
      const p = person({ nameRequest: odd as unknown as NameRequest });
      expect(showName(p, where('adult')), String(odd)).toEqual({ shown: false, why: 'removed' });
    }
  });

  it('hides the name beside numbers for a level it does not know or another league', () => {
    const admin: Viewer = { leagueId, leagueAdmin: true, staffOfTeamIds: [teamId] };
    const restricted = { shown: false, why: 'restricted' };
    const stage4 = { leagueId, teamId, statsVisibility: 'members' } as unknown as TeamStatsSetting;
    expect(showName(person(), where('adult', {}, { statsOf: stage4, viewer: admin }))).toEqual(
      restricted,
    );
    const elsewhere: TeamStatsSetting = {
      leagueId: 'league-2',
      teamId,
      statsVisibility: 'everyone',
    };
    expect(showName(person(), where('adult', {}, { statsOf: elsewhere }))).toEqual(restricted);
  });

  it('hides the name when a caller leaves out where it is shown', () => {
    const missing = {
      audience: 'adult',
      policy: defaultNamePolicy,
      viewer: publicViewer(leagueId),
    };
    expect(showName(person(), missing as unknown as Parameters<typeof showName>[1])).toEqual({
      shown: false,
      why: 'restricted',
    });
  });
});

describe('numberInPlace: the number a line shows for a name not shown (R-24, S-34)', () => {
  it('gives the number only for a hidden name or none recorded', () => {
    expect(numberInPlace({ shown: false, why: 'hidden' }, '12')).toBe('12');
    expect(numberInPlace({ shown: false, why: 'no_name' }, ' 7 ')).toBe('7');
    expect(numberInPlace({ shown: false, why: 'removed' }, '12')).toBeNull();
    expect(numberInPlace({ shown: false, why: 'restricted' }, '12')).toBeNull();
    expect(numberInPlace({ shown: true, text: 'Noor H.' }, '12')).toBeNull();
    expect(numberInPlace({ shown: false, why: 'hidden' }, null)).toBeNull();
    expect(numberInPlace({ shown: false, why: 'hidden' }, ' ')).toBeNull();
  });
});
