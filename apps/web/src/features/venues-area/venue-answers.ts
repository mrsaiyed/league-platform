// What a refused change to a venue or court says, and which box it marks (step 2.49;
// record 067). The words come from the message files. A command refuses a box that is not
// right as "invalid-input" without naming it, so the box is found from what was typed, by
// the same limits the command holds (core's venue-fields.ts).
import type { TextKey } from '../../server/messages.ts';

const known = [
  'changed-since-read',
  'court-has-games-to-come',
  'court-name-taken',
  'court-not-found',
  'court-venue-in-bin',
  'not-allowed',
  'not-confirmed',
  'venue-has-courts',
  'venue-has-games-to-come',
  'venue-name-taken',
  'venue-not-found',
] as const;

export type VenueForm = 'venue' | 'court' | 'other';

/** The first box a venue form holds that the command would refuse, if any. */
export function wrongVenueBox(typed: Readonly<Record<string, string>>): string | undefined {
  const name = (typed['name'] ?? '').trim();
  if (name === '' || name.length > 120) return 'name';
  const address = (typed['address'] ?? '').trim();
  if (address.length > 300) return 'address';
  const link = (typed['mapLink'] ?? '').trim();
  if (link !== '' && (link.length > 2000 || !/^https:\/\/\S+$/.test(link))) return 'mapLink';
  return undefined;
}

/** The boxes to mark for a refusal. */
export function wrongVenueFields(
  code: string,
  form: VenueForm,
  typed: Readonly<Record<string, string>>,
): readonly string[] {
  if (code === 'venue-name-taken' || code === 'court-name-taken') return ['name'];
  if (code !== 'invalid-input') return [];
  if (form === 'court') return ['name'];
  if (form === 'venue') {
    const box = wrongVenueBox(typed);
    return box === undefined ? [] : [box];
  }
  return [];
}

/** The sentence for a refusal. A name taken while putting one back says what to rename. */
export function venueProblemKey(
  code: string,
  form: VenueForm,
  typed: Readonly<Record<string, string>> = {},
  putBack = false,
): TextKey {
  if (putBack && code === 'venue-name-taken') return 'adminVenues.problem.restore-venue-name-taken';
  if (putBack && code === 'court-name-taken') return 'adminVenues.problem.restore-court-name-taken';
  if (code === 'invalid-input') {
    if (form === 'court') return 'adminVenues.problem.invalid-court';
    const box = form === 'venue' ? wrongVenueBox(typed) : undefined;
    if (box === 'address') return 'adminVenues.problem.invalid-address';
    if (box === 'mapLink') return 'adminVenues.problem.invalid-map-link';
    if (box === 'name') return 'adminVenues.problem.invalid-name';
    return 'adminVenues.problem.unknown';
  }
  const found = known.find((k) => k === code);
  return found === undefined
    ? 'adminVenues.problem.unknown'
    : (`adminVenues.problem.${found}` as TextKey);
}
