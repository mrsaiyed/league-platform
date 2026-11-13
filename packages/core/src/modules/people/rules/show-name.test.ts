import { describe, expect, it } from 'vitest';
import { audiences, type Audience } from '../../leagues/index.ts';
import {
  childNameForms,
  defaultNamePolicy,
  nameRequests,
  type NamePolicy,
  type NameRequest,
} from './name-policy.ts';
import { showName, type PersonForDisplay, type ShownName } from './show-name.ts';
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

describe('showName: the league display policy (R-14, R-15)', () => {
  it('shows children in a youth league by first name and last initial to start with', () => {
    expect(showName(person({ isMinor: true }), where('youth'))).toEqual(named('Amina Y.'));
  });

  it('treats a youth league player of unknown age as a child', () => {
    expect(showName(person(), where('youth'))).toEqual(named('Amina Y.'));
    expect(showName(person(), where('mixed'))).toEqual(named('Amina Y.'));
  });

  it('shows a known adult in a youth league, such as a coach, by full name', () => {
    expect(showName(person({ isMinor: false }), where('youth'))).toEqual(named('Amina Yusuf'));
  });

  it('shows children by full name once the admin switches to it', () => {
    expect(showName(person(), where('youth', { children: 'full_name' }))).toEqual(
      named('Amina Yusuf'),
    );
  });

  it('shows adults by full name, and a child in an adult league with care', () => {
    expect(showName(person(), where('adult'))).toEqual(named('Amina Yusuf'));
    expect(showName(person({ isMinor: true }), where('adult'))).toEqual(named('Amina Y.'));
  });

  it('shows initials only when the player asked and the league allows asking', () => {
    const asked = person({ nameRequest: 'initials' });
    expect(showName(asked, where('adult'))).toEqual(named('Amina Yusuf'));
    expect(showName(asked, where('adult', { playersMayAskForInitials: true }))).toEqual(
      named('A. Y.'),
    );
    expect(showName(asked, where('youth', { playersMayAskForInitials: true }))).toEqual(
      named('A. Y.'),
    );
  });

  it('leaves a name off when the person asked for it to be taken off (R-17)', () => {
    expect(showName(person({ nameRequest: 'removed' }), where('adult'))).toEqual({
      shown: false,
      why: 'removed',
    });
  });

  it('tidies spaces and handles missing or accented parts', () => {
    expect(
      showName(person({ firstName: '  Amina ', lastName: ' de  la Cruz ' }), where('adult')),
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
    expect(showName(person(), where('adult'))).toEqual(named('Amina Yusuf'));
  });

  it("names them for the team's staff and the league's admins", () => {
    const staff: Viewer = { leagueId, leagueAdmin: false, staffOfTeamIds: [teamId] };
    const admin: Viewer = { leagueId, leagueAdmin: true, staffOfTeamIds: [] };
    expect(showName(person(), where('adult', {}, { statsOf: staffOnly, viewer: staff }))).toEqual(
      named('Amina Yusuf'),
    );
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
    if (request === 'initials' && policy.playersMayAskForInitials) return named('A. Y.');
    const child = isMinor === true || (isMinor === null && audience !== 'adult');
    if (child && policy.children === 'first_name_last_initial') return named('Amina Y.');
    return named('Amina Yusuf');
  }

  it('matches the rules for all of them', () => {
    const mismatches: string[] = [];
    let count = 0;
    for (const audience of audiences)
      for (const children of childNameForms)
        for (const playersMayAskForInitials of [false, true])
          for (const isMinor of ages)
            for (const nameRequest of nameRequests)
              for (const setting of settings)
                for (const [who, viewer, mayViewStaffOnly] of viewers) {
                  count += 1;
                  const policy: NamePolicy = { children, playersMayAskForInitials };
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
                      `${audience} ${children} ask=${String(playersMayAskForInitials)} ` +
                        `minor=${String(isMinor)} ${nameRequest} ` +
                        `${setting?.statsVisibility ?? 'no stats'} ${who}: ` +
                        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
                    );
                  }
                }
    expect(mismatches).toEqual([]);
    expect(count).toBe(3 * 2 * 2 * 3 * 3 * 3 * 4);
  });

  it('never shows the full surname under the children rule or an initials request', () => {
    for (const audience of audiences)
      for (const isMinor of ages)
        for (const nameRequest of nameRequests) {
          const result = showName(person({ isMinor, nameRequest }), where(audience));
          const child = isMinor === true || (isMinor === null && audience !== 'adult');
          if (child && result.shown) expect(result.text).not.toContain('Yusuf');
        }
  });
});

describe('showName: fails closed on values it does not know', () => {
  it('counts an isMinor that is neither true nor false as not known', () => {
    for (const odd of ['true', 'false', 0, 1, undefined, 'yes']) {
      const p = person({ isMinor: odd as unknown as boolean | null });
      expect(showName(p, where('youth')), String(odd)).toEqual(named('Amina Y.'));
      expect(showName(p, where('mixed')), String(odd)).toEqual(named('Amina Y.'));
      expect(showName(p, where('adult')), String(odd)).toEqual(named('Amina Yusuf'));
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
