// readNamePolicy over made-up stored settings, and the T-81 scan of a youth league's
// roster under each value of the two privacy settings (steps 2.126 and 2.162). The scan
// of every other public surface under each value is modules/name-policy-scan.test.ts;
// the comparison with the behaviour before step 2.162 is people/no-more-than-before.test.ts.
import { describe, expect, it } from 'vitest';
import type { StoredSettingRow } from '../../leagues/index.ts';
import { publicRosterLine, type RosterLineSource } from '../../teams/index.ts';
import { defaultNamePolicy, type NameRequest } from '../rules/name-policy.ts';
import { findPrivateFields, privateValuesOf } from '../rules/private-field-scan.ts';
import { publicViewer } from '../rules/viewer.ts';
import { readNamePolicy, type NamePolicySettings } from './read-name-policy.ts';

/** Stored values by key, at the league, or at a season when `season` is given. */
function stored(values: Record<string, unknown>, level: 'league' | 'season' = 'league') {
  const asked: string[] = [];
  const settings: NamePolicySettings = {
    settingRows: async (key): Promise<readonly StoredSettingRow[]> => {
      asked.push(key);
      return Object.hasOwn(values, key)
        ? [{ level, document: { version: 1, value: values[key] }, version: 1 }]
        : [];
    },
  };
  return { settings, asked };
}

const confirmedKey = 'privacy.childrenInFullConfirmed';

describe('readNamePolicy', () => {
  it('is our starting policy when the league has set nothing (R-14, R-15, R-29)', async () => {
    const { settings, asked } = stored({});
    expect(await readNamePolicy(settings)).toEqual(defaultNamePolicy);
    // Every league starts on full names with the confirmation not given (record 065).
    expect(defaultNamePolicy).toEqual({
      names: 'full_name',
      childrenInFull: false,
      playersMayAskForInitials: false,
    });
    expect(asked.sort()).toEqual([
      confirmedKey,
      'privacy.playersMayAskForInitials',
      'privacy.publicNames',
    ]);
  });

  it("reads the league's own values; children in full only with the confirmation", async () => {
    expect(
      await readNamePolicy(
        stored({
          'privacy.publicNames': 'fullName',
          [confirmedKey]: true,
          'privacy.playersMayAskForInitials': true,
        }).settings,
      ),
    ).toEqual({ names: 'full_name', childrenInFull: true, playersMayAskForInitials: true });
    expect(await readNamePolicy(stored({ 'privacy.publicNames': 'hidden' }).settings)).toEqual({
      names: 'hidden',
      childrenInFull: false,
      playersMayAskForInitials: false,
    });
    // The confirmation is read whatever the names value; showName uses it only under full names.
    expect(
      await readNamePolicy(
        stored({ 'privacy.publicNames': 'firstNameLastInitial', [confirmedKey]: true }).settings,
      ),
    ).toEqual({
      names: 'first_name_last_initial',
      childrenInFull: true,
      playersMayAskForInitials: false,
    });
  });

  it('reads a full names stored before step 2.162, with no confirmation, as not confirmed (record 065)', async () => {
    expect(await readNamePolicy(stored({ 'privacy.publicNames': 'fullName' }).settings)).toEqual(
      defaultNamePolicy,
    );
  });

  it('ignores a stored value its setting refuses, and one stored anywhere but the league', async () => {
    const refused = stored({
      'privacy.publicNames': 'everything',
      [confirmedKey]: 'yes',
      'privacy.playersMayAskForInitials': 'yes',
    }).settings;
    expect(await readNamePolicy(refused)).toEqual(defaultNamePolicy);
    const atSeason = stored({ 'privacy.publicNames': 'hidden', [confirmedKey]: true }, 'season');
    expect(await readNamePolicy(atSeason.settings)).toEqual(defaultNamePolicy);
  });
});

describe('a youth roster under each name setting (T-81)', () => {
  const people: (RosterLineSource & {
    readonly nameRequest: NameRequest;
    readonly birthDate: string;
  })[] = [
    { first: 'Mariam', last: 'Okafor', isMinor: null, request: 'none' },
    { first: 'Yusuf', last: 'Haddad', isMinor: true, request: 'initials' },
    { first: 'Lena', last: 'Fischer', isMinor: false, request: 'none' },
    { first: 'Omar', last: 'Rahimi', isMinor: true, request: 'removed' },
  ].map((p, i) => ({
    entryId: `e${i}`,
    jerseyNumber: String(i + 4),
    role: 'player' as const,
    leftOn: null,
    firstName: p.first,
    lastName: p.last,
    isMinor: p.isMinor,
    nameRequest: p.request as NameRequest,
    personBinned: false,
    birthDate: `2011-0${i + 1}-05`,
  }));

  // Yusuf is a child who asked for initials: that always takes effect (R-25), and never
  // shows more than "hidden". Lena is an adult: in full to start with (R-15), and shown
  // less only once the league chooses less (R-29). Children are in full only with the
  // confirmation (R-14).
  const cases = [
    {
      values: {},
      shown: ['Mariam O.', 'Y. H.', 'Lena Fischer', null],
    },
    {
      values: { 'privacy.publicNames': 'fullName' },
      shown: ['Mariam O.', 'Y. H.', 'Lena Fischer', null],
    },
    {
      values: { 'privacy.publicNames': 'fullName', [confirmedKey]: true },
      shown: ['Mariam Okafor', 'Y. H.', 'Lena Fischer', null],
    },
    {
      values: { 'privacy.publicNames': 'firstNameLastInitial', [confirmedKey]: true },
      shown: ['Mariam O.', 'Y. H.', 'Lena F.', null],
    },
    {
      values: { 'privacy.publicNames': 'hidden' },
      shown: [null, null, null, null],
    },
    {
      values: { 'privacy.playersMayAskForInitials': true },
      shown: ['Mariam O.', 'Y. H.', 'Lena Fischer', null],
    },
    {
      values: { [confirmedKey]: true, 'privacy.playersMayAskForInitials': true },
      shown: ['Mariam Okafor', 'Y. H.', 'Lena Fischer', null],
    },
    {
      values: { 'privacy.publicNames': 'hidden', [confirmedKey]: true },
      shown: [null, null, null, null],
    },
  ];

  it.each(cases)('shows the names the settings say and nothing private: $values', async (c) => {
    const policy = await readNamePolicy(stored(c.values).settings);
    const display = { viewer: publicViewer('L1'), policy };
    const lines = people.map((p) => publicRosterLine(p, 'youth', display));
    expect(lines.map((l) => (l.name.shown ? l.name.text : null))).toEqual(c.shown);
    // The person removed still has a line, with their number (R-17).
    expect(lines[3]).toMatchObject({ jerseyNumber: '7', name: { shown: false, why: 'removed' } });
    const privateValues = people.flatMap((p, i) => [
      ...privateValuesOf(p, lines[i]?.name ?? { shown: false, why: 'no_name' }),
      p.birthDate,
    ]);
    expect(findPrivateFields(lines, { privateValues })).toEqual([]);
  });
});
