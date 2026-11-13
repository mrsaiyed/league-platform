// For tests (T-81, T4 §12): scans a public response, the cached page's data or a live
// message, for raw names, birth dates and contact details. Every public query's test
// runs its response through this and expects no findings.
import type { ShownName } from './show-name.ts';

export interface PrivateFieldFinding {
  /** Where it was found, as `$.teams[0].players[2].birthDate`. */
  readonly path: string;
  /** A field whose name says it is private, or a known private value appearing anywhere. */
  readonly kind: 'private_field' | 'private_value';
  /** The field's name or the value found. */
  readonly found: string;
}

/** Field names, compared without case, spaces, `_` or `-`, that never belong in a public response. */
const PRIVATE_FIELD_NAMES = new Set([
  'firstname',
  'lastname',
  'middlename',
  'givenname',
  'familyname',
  'surname',
  'fullname',
  'legalname',
  'dob',
  'birthday',
  'dateofbirth',
  'answers',
  'guardian',
  'guardians',
]);

/** Parts of a field name that mark it private wherever they appear (`contactEmail`, `homePhone`). */
const PRIVATE_FIELD_PARTS = ['birth', 'email', 'phone', 'mobile', 'medical', 'emergency'];

function normalizedFieldName(name: string): string {
  return name.toLowerCase().replace(/[\s_-]/g, '');
}

function isPrivateFieldName(name: string): boolean {
  const n = normalizedFieldName(name);
  return PRIVATE_FIELD_NAMES.has(n) || PRIVATE_FIELD_PARTS.some((part) => n.includes(part));
}

function normalizedText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Shorter values are too likely to match by chance to be worth checking. */
const MIN_VALUE_LENGTH = 3;

/**
 * The raw values of one person that must not appear in a public response: birth date,
 * contact email and phone, and the full name whenever the name shown is anything else.
 */
export interface PrivatePersonFields {
  readonly firstName: string;
  readonly lastName: string;
  readonly birthDate?: string | null;
  readonly contactEmail?: string | null;
  readonly phone?: string | null;
}

export function privateValuesOf(person: PrivatePersonFields, shown: ShownName): string[] {
  const values: string[] = [];
  for (const value of [person.birthDate, person.contactEmail, person.phone]) {
    if (value) values.push(value);
  }
  const first = person.firstName.trim();
  const last = person.lastName.trim();
  const fullName = `${first} ${last}`;
  if (first && last && !(shown.shown && normalizedText(shown.text) === normalizedText(fullName))) {
    values.push(fullName, `${last}, ${first}`, `${last} ${first}`);
  }
  return values;
}

function child(path: string, key: string | number): string {
  if (typeof key === 'number') return `${path}[${key}]`;
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

/**
 * Every private field name and every known private value in `response`. A string
 * response that is JSON is read as JSON; any other string (a page's HTML) is checked
 * for the known values only.
 */
export function findPrivateFields(
  response: unknown,
  options: { readonly privateValues?: readonly string[] } = {},
): PrivateFieldFinding[] {
  const values = (options.privateValues ?? [])
    .map(normalizedText)
    .filter((value) => value.length >= MIN_VALUE_LENGTH);
  const findings: PrivateFieldFinding[] = [];
  const seen = new Set<object>();

  const checkText = (text: string, path: string): void => {
    const normalized = normalizedText(text);
    for (const value of values) {
      if (normalized.includes(value)) findings.push({ path, kind: 'private_value', found: value });
    }
  };

  const walk = (node: unknown, path: string): void => {
    if (typeof node === 'string') {
      checkText(node, path);
      return;
    }
    if (node === null || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach((item: unknown, index) => walk(item, child(path, index)));
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      const at = child(path, key);
      if (isPrivateFieldName(key)) findings.push({ path: at, kind: 'private_field', found: key });
      checkText(key, at);
      walk(value, at);
    }
  };

  if (typeof response === 'string') {
    const trimmed = response.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        walk(JSON.parse(trimmed) as unknown, '$');
        return findings;
      } catch {
        // Not JSON after all: checked as text below.
      }
    }
    checkText(response, '$');
    return findings;
  }
  walk(response, '$');
  return findings;
}
