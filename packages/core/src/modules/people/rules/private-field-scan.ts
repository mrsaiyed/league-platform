// For tests (T-81, T4 §12): scans a public response, the cached page's data or a live
// message, for raw names, birth dates, contact details and home addresses. Every public
// query's test runs its response through this and expects no findings. When in doubt it
// reports a finding: a false alarm costs a look, a miss leaks a child's details.
import type { NameRequest } from './name-policy.ts';
import type { ShownName } from './show-name.ts';

export interface PrivateFieldFinding {
  /** Where it was found, as `$.teams[0].players[2].birthDate`. */
  readonly path: string;
  /** A field whose name says it is private, or a known private value appearing anywhere. */
  readonly kind: 'private_field' | 'private_value';
  /** The field's name or the value found. */
  readonly found: string;
}

/**
 * Parts of a field name that mark it private wherever they appear, compared without
 * case, spaces, `_` or `-` (`contactEmail`, `HOME_PHONE`, `foodAllergies`).
 */
const PRIVATE_KEY_PARTS = [
  'firstname',
  'lastname',
  'middlename',
  'surname',
  'fullname',
  'legalname',
  'givenname',
  'familyname',
  'birth',
  'guardian',
  'answer',
  'contact',
  'allerg',
  'health',
  'email',
  'phone',
  'mobile',
  'medical',
  'emergency',
  'homeaddress',
];

/**
 * Parts too short or too common to match inside a word (`cancelled`, `transparent`,
 * `adobe`): these count only where a word of the field's name starts with them.
 */
const PRIVATE_KEY_WORDS = ['dob', 'bornon', 'parent', 'cell'];

/** A person's address. A venue's address is public, so this counts only on a person. */
const PERSON_ADDRESS_WORDS = ['address', 'street', 'postcode', 'postalcode', 'zip'];

/** Field names under which the objects are people (`players[3]`, `guardian.name`). */
const PERSON_KEY_WORDS = [
  'player',
  'person',
  'people',
  'member',
  'guardian',
  'parent',
  'coach',
  'staff',
  'athlete',
  'contact',
  'official',
  'referee',
];

interface KeyWords {
  /** The name lowercased with everything but letters and digits removed. */
  readonly joined: string;
  /** Where each word of the name starts in `joined`. */
  readonly starts: readonly number[];
}

function keyWords(key: string): KeyWords {
  const words = key
    .normalize('NFC')
    .replace(/([\p{Ll}\d])(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const starts: number[] = [];
  let at = 0;
  for (const word of words) {
    starts.push(at);
    at += word.length;
  }
  return { joined: words.join(''), starts };
}

function hasWordStarting(key: KeyWords, parts: readonly string[]): boolean {
  return parts.some((part) => key.starts.some((start) => key.joined.startsWith(part, start)));
}

function isPrivateKey(key: KeyWords): boolean {
  return (
    PRIVATE_KEY_PARTS.some((part) => key.joined.includes(part)) ||
    hasWordStarting(key, PRIVATE_KEY_WORDS)
  );
}

function normalizedText(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code =
        body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isInteger(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** The text as a reader would see it: entities decoded, tags read both as a gap and as nothing. */
function readings(text: string): string[] {
  const decoded = decodeEntities(text.normalize('NFC'));
  const forms = [decoded, decoded.replace(/<[^>]*>/g, ' '), decoded.replace(/<[^>]*>/g, '')];
  return [...new Set(forms.map(normalizedText))];
}

/** Digits of a value written like a phone number (`(555) 014-2`, `+1 555 0142`), else null. */
function phoneDigits(value: string): string | null {
  if (!/^[+\d\s().\-/]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 ? digits : null;
}

/** Every run of digits in the text, read through spaces, dots, dashes and brackets. */
function digitRuns(text: string): string[] {
  return (text.match(/\d[\d\s().\-/]*\d/g) ?? []).map((run) => run.replace(/\D/g, ''));
}

/** Shorter values are matched only as whole words, not inside other words. */
const MIN_SUBSTRING_LENGTH = 3;

/**
 * The raw values of one person that must not appear in a public response: birth date,
 * contact email and phone, home address, the full name whenever the name shown is
 * anything else, the surname whenever the shown name leaves it out, and the first name
 * whenever the person asked for initials or to be taken off and the shown name leaves
 * it out.
 */
export interface PrivatePersonFields {
  readonly firstName: string;
  readonly lastName: string;
  readonly nameRequest: NameRequest;
  readonly birthDate?: string | null;
  readonly contactEmail?: string | null;
  readonly phone?: string | null;
  readonly address?: string | null;
}

export function privateValuesOf(person: PrivatePersonFields, shown: ShownName): string[] {
  const values: string[] = [];
  for (const value of [person.birthDate, person.contactEmail, person.phone, person.address]) {
    if (value) values.push(value);
  }
  const first = person.firstName.trim();
  const last = person.lastName.trim();
  const shownText = shown.shown ? normalizedText(shown.text) : '';
  const fullName = `${first} ${last}`;
  if (first && last && shownText !== normalizedText(fullName)) {
    values.push(fullName, `${last}, ${first}`, `${last} ${first}`);
  }
  if (last && !shownText.includes(normalizedText(last))) values.push(last);
  if (first && person.nameRequest !== 'none' && !shownText.includes(normalizedText(first))) {
    values.push(first);
  }
  return values;
}

function child(path: string, key: string | number): string {
  if (typeof key === 'number') return `${path}[${key}]`;
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length > 1)
  );
}

function parsed(
  text: string,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  if (!looksLikeJson(text)) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

interface ValueCheck {
  readonly value: string;
  readonly text: string;
  readonly phone: string | null;
  readonly wholeWord: RegExp | null;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface PrivateFieldScanOptions {
  /**
   * The private values of every made-up person behind the response, from
   * `privateValuesOf`. Required, so a scan that forgot them fails instead of passing.
   * Pass `[]` only where a test checks field names alone.
   */
  readonly privateValues: readonly string[];
}

/**
 * Every private field name and every known private value in `response`, read as it
 * would be sent (`JSON.stringify`). A string that is JSON, at the top or inside a
 * field, is read as JSON; any other string (a page's HTML) is checked
 * for the known values with its entities decoded and its tags removed.
 */
export function findPrivateFields(
  response: unknown,
  options: PrivateFieldScanOptions,
): PrivateFieldFinding[] {
  const given: unknown = (options as Partial<PrivateFieldScanOptions> | undefined)?.privateValues;
  if (!Array.isArray(given) || !given.every((value) => typeof value === 'string')) {
    throw new Error(
      'findPrivateFields needs privateValues: build them with privateValuesOf for each ' +
        'made-up person behind the response (pass [] only to check field names alone).',
    );
  }
  const checks: ValueCheck[] = [];
  for (const raw of given as readonly string[]) {
    const text = normalizedText(raw);
    if (text === '') continue;
    checks.push({
      value: raw,
      text,
      phone: phoneDigits(raw),
      wholeWord:
        text.length < MIN_SUBSTRING_LENGTH
          ? new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(text)}(?![\\p{L}\\p{N}])`, 'u')
          : null,
    });
  }

  const findings: PrivateFieldFinding[] = [];
  const reported = new Set<string>();
  const report = (finding: PrivateFieldFinding): void => {
    const id = `${finding.kind}\u0000${finding.path}\u0000${finding.found}`;
    if (reported.has(id)) return;
    reported.add(id);
    findings.push(finding);
  };

  const checkText = (text: string, path: string): void => {
    const forms = readings(text);
    const runs = digitRuns(decodeEntities(text));
    for (const check of checks) {
      const hit =
        forms.some((form) =>
          check.wholeWord ? check.wholeWord.test(form) : form.includes(check.text),
        ) ||
        (check.phone !== null && runs.some((run) => run.includes(check.phone ?? '')));
      if (hit) report({ path, kind: 'private_value', found: check.text });
    }
  };

  const walk = (node: unknown, path: string, amongPeople: boolean, depth: number): void => {
    if (typeof node === 'string') {
      const inner = depth < 8 ? parsed(node) : { ok: false as const };
      if (inner.ok) walk(inner.value, path, amongPeople, depth + 1);
      else checkText(node, path);
      return;
    }
    if (typeof node === 'number') {
      checkText(String(node), path);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((item: unknown, index) => walk(item, child(path, index), amongPeople, depth));
      return;
    }
    const entries = Object.entries(node as Record<string, unknown>);
    const keys = entries.map(([key]) => keyWords(key));
    const isPerson = amongPeople || keys.some(isPrivateKey);
    entries.forEach(([key, value], index) => {
      const words = keys[index] ?? keyWords(key);
      const at = child(path, key);
      if (isPrivateKey(words) || (isPerson && hasWordStarting(words, PERSON_ADDRESS_WORDS))) {
        report({ path: at, kind: 'private_field', found: key });
      }
      checkText(key, at);
      walk(value, at, hasWordStarting(words, PERSON_KEY_WORDS), depth);
    });
  };

  if (typeof response === 'string') {
    walk(response, '$', false, 0);
    return findings;
  }
  // Read what would actually be sent: dates become text, functions and undefined drop out.
  const sent = JSON.stringify(response);
  if (sent === undefined) return findings;
  walk(JSON.parse(sent) as unknown, '$', false, 0);
  return findings;
}
