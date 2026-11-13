import { describe, expect, it } from 'vitest';
import { defaultNamePolicy } from './name-policy.ts';
import {
  findPrivateFields,
  privateValuesOf,
  type PrivatePersonFields,
} from './private-field-scan.ts';
import { showName } from './show-name.ts';
import { publicViewer } from './viewer.ts';

const amina: PrivatePersonFields & { isMinor: boolean | null } = {
  firstName: 'Amina',
  lastName: 'Yusuf',
  birthDate: '2011-04-09',
  contactEmail: 'parent.yusuf@example.test',
  phone: '555-0142',
  isMinor: true,
};

const shown = showName(
  { ...amina, nameRequest: 'none' },
  { audience: 'youth', policy: defaultNamePolicy, viewer: publicViewer },
);
const privateValues = privateValuesOf(amina, shown);

/** A roster as a public query should build it: names only through showName (T-29, T-81). */
function publicRoster(): Record<string, unknown> {
  return {
    team: { name: 'Northside Hawks', venue: { name: 'Main Gym', address: '12 Court Street' } },
    players: [{ id: 'p1', jersey: 7, name: shown.shown ? shown.text : null, former: false }],
    updatedAt: '2026-11-13T18:00:00Z',
  };
}

describe('findPrivateFields (T-81, T4 §12)', () => {
  it('finds nothing in a response built through showName', () => {
    expect(shown).toEqual({ shown: true, text: 'Amina Y.' });
    expect(findPrivateFields(publicRoster(), { privateValues })).toEqual([]);
  });

  it('catches a planted birth date field, wherever it is nested', () => {
    const response = publicRoster();
    (response.players as Array<Record<string, unknown>>)[0]!.birth_date = '2011-04-09';
    expect(findPrivateFields(response, { privateValues })).toEqual([
      { path: '$.players[0].birth_date', kind: 'private_field', found: 'birth_date' },
      { path: '$.players[0].birth_date', kind: 'private_value', found: '2011-04-09' },
    ]);
  });

  it('catches private field names in any spelling', () => {
    for (const key of [
      'firstName',
      'last_name',
      'Surname',
      'dateOfBirth',
      'dob',
      'contactEmail',
      'email',
      'guardian_phone',
      'medicalNotes',
      'emergency-contact',
      'answers',
    ]) {
      const findings = findPrivateFields({ player: { [key]: 'x' } });
      expect(
        findings.map(({ kind, found }) => ({ kind, found })),
        key,
      ).toEqual([{ kind: 'private_field', found: key }]);
    }
    expect(findPrivateFields({ 'emergency-contact': 'x' })[0]?.path).toBe('$["emergency-contact"]');
  });

  it('leaves ordinary public fields alone', () => {
    const response = { name: 'Hawks', displayName: 'Amina Y.', address: '12 Court St', team: 'A' };
    expect(findPrivateFields(response)).toEqual([]);
  });

  it('catches a raw full name or contact detail under an innocent field name', () => {
    const response = publicRoster();
    (response.players as Array<Record<string, unknown>>)[0]!.label = 'Yusuf, Amina (#7)';
    (response.team as Record<string, unknown>).note = 'Call 555-0142';
    expect(findPrivateFields(response, { privateValues }).map((f) => f.path)).toEqual([
      '$.team.note',
      '$.players[0].label',
    ]);
  });

  it('reads a JSON string as JSON and checks any other text, such as HTML, for the values', () => {
    const response = publicRoster();
    (response.players as Array<Record<string, unknown>>)[0]!.contact_email = 'x@example.test';
    expect(findPrivateFields(JSON.stringify(response))).toEqual([
      { path: '$.players[0].contact_email', kind: 'private_field', found: 'contact_email' },
    ]);
    const html = '<li>Amina  YUSUF <span>#7</span></li>';
    expect(findPrivateFields(html, { privateValues })).toEqual([
      { path: '$', kind: 'private_value', found: 'amina yusuf' },
    ]);
    expect(findPrivateFields('<li>Amina Y. #7</li>', { privateValues })).toEqual([]);
  });

  it('does not treat a full name as private where the policy shows it', () => {
    const adult = showName(
      { ...amina, isMinor: false, nameRequest: 'none' },
      { audience: 'adult', policy: defaultNamePolicy, viewer: publicViewer },
    );
    expect(privateValuesOf(amina, adult)).toEqual([
      '2011-04-09',
      'parent.yusuf@example.test',
      '555-0142',
    ]);
    expect(privateValuesOf({ firstName: 'Amina', lastName: 'Yusuf' }, shown)).toEqual([
      'Amina Yusuf',
      'Yusuf, Amina',
      'Yusuf Amina',
    ]);
  });
});
