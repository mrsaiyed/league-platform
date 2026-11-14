// readNamePolicy over made-up stored settings, and the T-81 scan of a youth league's
// roster under each value of the two privacy settings (step 2.126).
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

describe('readNamePolicy', () => {
  it('is our starting policy when the league has set nothing (R-14, R-15)', async () => {
    const { settings, asked } = stored({});
    expect(await readNamePolicy(settings)).toEqual(defaultNamePolicy);
    expect(asked.sort()).toEqual(['privacy.playersMayAskForInitials', 'privacy.publicNames']);
  });

  it("reads the league's own values", async () => {
    const { settings } = stored({
      'privacy.publicNames': 'fullName',
      'privacy.playersMayAskForInitials': true,
    });
    expect(await readNamePolicy(settings)).toEqual({
      children: 'full_name',
      playersMayAskForInitials: true,
    });
  });

  it('ignores a stored value its setting refuses, and one stored anywhere but the league', async () => {
    expect(
      await readNamePolicy(
        stored({ 'privacy.publicNames': 'everything', 'privacy.playersMayAskForInitials': 'yes' })
          .settings,
      ),
    ).toEqual(defaultNamePolicy);
    expect(
      await readNamePolicy(stored({ 'privacy.publicNames': 'fullName' }, 'season').settings),
    ).toEqual(defaultNamePolicy);
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

  const cases = [
    {
      values: {},
      shown: ['Mariam O.', 'Yusuf H.', 'Lena Fischer', null],
    },
    {
      values: { 'privacy.publicNames': 'fullName' },
      shown: ['Mariam Okafor', 'Yusuf Haddad', 'Lena Fischer', null],
    },
    {
      values: { 'privacy.playersMayAskForInitials': true },
      shown: ['Mariam O.', 'Y. H.', 'Lena Fischer', null],
    },
    {
      values: { 'privacy.publicNames': 'fullName', 'privacy.playersMayAskForInitials': true },
      shown: ['Mariam Okafor', 'Y. H.', 'Lena Fischer', null],
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
