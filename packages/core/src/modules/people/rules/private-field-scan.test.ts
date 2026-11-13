import { describe, expect, it } from 'vitest';
import { defaultNamePolicy, type NameRequest } from './name-policy.ts';
import {
  findPrivateFields,
  privateValuesOf,
  type PrivatePersonFields,
} from './private-field-scan.ts';
import { showName } from './show-name.ts';
import { publicViewer } from './viewer.ts';

const viewer = publicViewer('league-1');

const amina: PrivatePersonFields & { isMinor: boolean | null } = {
  firstName: 'Amina',
  lastName: 'Yusuf',
  nameRequest: 'none',
  birthDate: '2011-04-09',
  contactEmail: 'parent.yusuf@example.test',
  phone: '555-0142',
  address: '4 Willow Lane',
  isMinor: true,
};

const shown = showName(amina, {
  audience: 'youth',
  policy: defaultNamePolicy,
  viewer,
  statsOf: null,
});
const privateValues = privateValuesOf(amina, shown);

/** A roster as a public query should build it: names only through showName (T-29, T-81). */
function publicRoster(): Record<string, unknown> {
  return {
    team: { name: 'Northside Hawks', venue: { name: 'Main Gym', address: '12 Court Street' } },
    players: [{ id: 'p1', jersey: 7, name: shown.shown ? shown.text : null, former: false }],
    updatedAt: '2026-11-13T18:00:00Z',
  };
}

function players(response: Record<string, unknown>): Array<Record<string, unknown>> {
  return response.players as Array<Record<string, unknown>>;
}

/** Where something was found, each place once (a full name also holds its surname). */
const paths = (found: ReturnType<typeof findPrivateFields>): string[] => [
  ...new Set(found.map((f) => f.path)),
];

describe('findPrivateFields (T-81, T4 §12)', () => {
  it('finds nothing in a response built through showName', () => {
    expect(shown).toEqual({ shown: true, text: 'Amina Y.' });
    expect(findPrivateFields(publicRoster(), { privateValues })).toEqual([]);
  });

  it('fails loudly when called without the private values', () => {
    const scan = findPrivateFields as (response: unknown, options?: unknown) => unknown;
    expect(() => scan(publicRoster())).toThrow(/privateValues/);
    expect(() => scan(publicRoster(), {})).toThrow(/privateValues/);
    expect(() => scan(publicRoster(), { privateValues: 'Amina Yusuf' })).toThrow(/privateValues/);
  });

  it('catches a planted birth date field, wherever it is nested', () => {
    const response = publicRoster();
    players(response)[0]!.birth_date = '2011-04-09';
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
      'FULLNAME',
      'legal-name',
      'givenName',
      'family_name',
      'dateOfBirth',
      'DATEOFBIRTH',
      'dob',
      'DOB',
      'bornOn',
      'contactEmail',
      'email',
      'HOMEPHONE',
      'guardian_phone',
      'guardianName',
      'parentName',
      'PARENT_EMAIL',
      'answer',
      'formAnswers',
      'contact',
      'cell',
      'cellNumber',
      'foodAllergies',
      'allergy',
      'healthNotes',
      'medicalNotes',
      'emergency-contact',
      'homeAddress',
      'home_address',
    ]) {
      const findings = findPrivateFields({ team: { [key]: 'x' } }, { privateValues: [] });
      expect(
        findings.map(({ kind, found }) => ({ kind, found })),
        key,
      ).toEqual([{ kind: 'private_field', found: key }]);
    }
    expect(findPrivateFields({ 'emergency-contact': 'x' }, { privateValues: [] })[0]?.path).toBe(
      '$["emergency-contact"]',
    );
  });

  it('leaves ordinary public fields alone, including a venue address', () => {
    const response = {
      name: 'Hawks',
      displayName: 'Amina Y.',
      address: '12 Court St',
      team: 'A',
      cancelled: false,
      transparent: true,
      excellence: 1,
      adobeId: 'x',
      venue: { name: 'Main Gym', address: '12 Court Street', postcode: 'A1' },
    };
    expect(findPrivateFields(response, { privateValues: [] })).toEqual([]);
  });

  it("catches a person's address, but only on a person", () => {
    const response = publicRoster();
    players(response)[0]!.address = 'somewhere';
    expect(findPrivateFields(response, { privateValues: [] })).toEqual([
      { path: '$.players[0].address', kind: 'private_field', found: 'address' },
    ]);
    const guardian = { guardian: { street: 'x' } };
    expect(paths(findPrivateFields(guardian, { privateValues: [] }))).toEqual([
      '$.guardian',
      '$.guardian.street',
    ]);
    const plain = { team: { address: '4 Willow Lane' } };
    expect(findPrivateFields(plain, { privateValues })).toEqual([
      { path: '$.team.address', kind: 'private_value', found: '4 willow lane' },
    ]);
  });

  it('catches a raw full name or contact detail under an innocent field name', () => {
    const response = publicRoster();
    players(response)[0]!.label = 'Yusuf, Amina (#7)';
    (response.team as Record<string, unknown>).note = 'Call 555-0142';
    expect(paths(findPrivateFields(response, { privateValues }))).toEqual([
      '$.team.note',
      '$.players[0].label',
    ]);
  });

  it('catches the surname alone', () => {
    const response = publicRoster();
    players(response)[0]!.family = 'the Yusuf family';
    expect(findPrivateFields(response, { privateValues })).toEqual([
      { path: '$.players[0].family', kind: 'private_value', found: 'yusuf' },
    ]);
  });

  it('catches the first name alone only when the person asked for initials or removal', () => {
    const asked = (nameRequest: NameRequest, mayAsk: boolean): string[] => {
      const person = { ...amina, nameRequest, isMinor: false };
      const result = showName(person, {
        audience: 'adult',
        policy: { ...defaultNamePolicy, playersMayAskForInitials: mayAsk },
        viewer,
        statsOf: null,
      });
      return privateValuesOf(person, result);
    };
    const firstOnly = { caption: 'Amina scored' };
    expect(findPrivateFields(firstOnly, { privateValues: asked('none', false) })).toEqual([]);
    expect(findPrivateFields(firstOnly, { privateValues: asked('initials', false) })).toEqual([]);
    expect(paths(findPrivateFields(firstOnly, { privateValues: asked('initials', true) }))).toEqual(
      ['$.caption'],
    );
    expect(paths(findPrivateFields(firstOnly, { privateValues: asked('removed', false) }))).toEqual(
      ['$.caption'],
    );
    const unknown = asked('hidden' as NameRequest, false);
    expect(unknown).toContain('Amina');
    expect(unknown).toContain('Yusuf');
  });

  it('matches names whatever the Unicode form and short surnames as whole words', () => {
    const omer = { firstName: 'Ömer', lastName: 'Li', nameRequest: 'removed' as const };
    const values = privateValuesOf(omer, { shown: false, why: 'removed' });
    expect(paths(findPrivateFields({ a: 'Ömer' }, { privateValues: values }))).toEqual(['$.a']);
    expect(paths(findPrivateFields({ a: 'Mr Li', b: 'Lions' }, { privateValues: values }))).toEqual(
      ['$.a'],
    );
  });

  it('matches a phone number however it is written', () => {
    for (const note of ['555 0142', '(555) 01-42', '5550142', 'ring 555.0142 now']) {
      expect(paths(findPrivateFields({ note }, { privateValues })), note).toEqual(['$.note']);
    }
    expect(paths(findPrivateFields({ note: 5550142 }, { privateValues }))).toEqual(['$.note']);
    expect(findPrivateFields({ note: 'Score 55-50, 142 fans' }, { privateValues })).toEqual([]);
  });

  it('reads what would be sent, so a value inside toJSON is caught', () => {
    const sneaky = { toJSON: () => ({ name: 'Amina Yusuf' }) };
    expect(paths(findPrivateFields({ row: sneaky }, { privateValues }))).toEqual(['$.row.name']);
  });

  it('reads a JSON string as JSON, at the top or inside a field', () => {
    const response = publicRoster();
    players(response)[0]!.contact_email = 'x@example.test';
    expect(findPrivateFields(JSON.stringify(response), { privateValues: [] })).toEqual([
      { path: '$.players[0].contact_email', kind: 'private_field', found: 'contact_email' },
    ]);
    const wrapped = { payload: JSON.stringify({ player: { dob: '2011-04-09' } }) };
    expect(findPrivateFields(wrapped, { privateValues })).toEqual([
      { path: '$.payload.player.dob', kind: 'private_field', found: 'dob' },
      { path: '$.payload.player.dob', kind: 'private_value', found: '2011-04-09' },
    ]);
  });

  it('checks any other text, such as HTML, for the values', () => {
    const scan = (html: string): string[] => paths(findPrivateFields(html, { privateValues }));
    expect(scan('<li>Amina  YUSUF <span>#7</span></li>')).toEqual(['$']);
    expect(scan('<li>Amina<b> Yusuf</b></li>')).toEqual(['$']);
    expect(scan('<li><b>Amina</b><b>Yusuf</b></li>')).toEqual(['$']);
    expect(scan('<li>Amina&nbsp;Yus&#117;f</li>')).toEqual(['$']);
    expect(scan('<li>Yusuf&#44; Amina</li>')).toEqual(['$']);
    expect(scan('<li>Amina Y. #7</li>')).toEqual([]);
  });

  it('does not treat a full name as private where the policy shows it', () => {
    const adult = showName(
      { ...amina, isMinor: false },
      { audience: 'adult', policy: defaultNamePolicy, viewer, statsOf: null },
    );
    expect(privateValuesOf(amina, adult)).toEqual([
      '2011-04-09',
      'parent.yusuf@example.test',
      '555-0142',
      '4 Willow Lane',
    ]);
    expect(
      privateValuesOf({ firstName: 'Amina', lastName: 'Yusuf', nameRequest: 'none' }, shown),
    ).toEqual(['Amina Yusuf', 'Yusuf, Amina', 'Yusuf Amina', 'Yusuf']);
  });
});
