// What a Teams screen's change answers with, and how that answer travels in the
// address (step 2.51). A form is answered by sending the browser back to the page with
// one of two fixed words in the address: `done` (what went well) or `problem` (the
// command's name and the code it refused with). The page turns the word into text from
// the message files; it never shows anything the person typed (T-187).
import { catalogs } from '@srleagues/site';
import type { TextKey } from '../../server/messages.ts';

/** What went well, each with a message `adminTeams.done.<name>`. */
export const doneNames = [
  'created',
  'updated',
  'statsSaved',
  'removed',
  'added',
  'entrySaved',
  'moved',
  'left',
  'putBack',
  'personRemoved',
] as const;
export type DoneName = (typeof doneNames)[number];

/**
 * A refused leaving date, said beside the roster line it was typed in, with what was
 * typed (step 2.161): the roster entry and the date. The date only ever goes back into
 * its own field, never shown as text (T-187).
 */
export type LeavingAt = { readonly entry: string; readonly leftOn: string };

export type Answer =
  | { readonly kind: 'done'; readonly done: DoneName }
  | {
      readonly kind: 'refused';
      readonly command: string;
      readonly code: string;
      readonly at?: LeavingAt;
    };

/** A refusal from a command, as the screen carries it: `teams.mark_left`, `already-left`. */
export function refused(command: string, code: string, at?: LeavingAt): Answer {
  return at === undefined
    ? { kind: 'refused', command, code }
    : { kind: 'refused', command, code, at };
}

export function done(name: DoneName): Answer {
  return { kind: 'done', done: name };
}

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateShape = /^\d{4}-\d{2}-\d{2}$/;

/** The anchor of a roster line, where a refusal of its leaving date is said. */
export const entryAnchor = (entryId: string): string => `entry-${entryId}`;

/**
 * The part of the address that carries an answer: `?done=created` or `?problem=...`; a
 * refused leaving date adds its line and what was typed, and the line's anchor.
 */
export function answerQuery(answer: Answer): string {
  if (answer.kind === 'done') return `?done=${answer.done}`;
  const problem = `?problem=${encodeURIComponent(`${answer.command}.${answer.code}`)}`;
  const at = answer.at;
  if (at === undefined || !uuidShape.test(at.entry)) return problem;
  const leftOn = dateShape.test(at.leftOn) ? at.leftOn : '';
  return `${problem}&entry=${at.entry.toLowerCase()}&leftOn=${leftOn}#${entryAnchor(at.entry.toLowerCase())}`;
}

type Query = Readonly<Record<string, string | string[] | undefined>>;

const only = (value: string | string[] | undefined): string | undefined =>
  typeof value === 'string' ? value : undefined;

/** The roster line a refusal is said beside, with the date typed there, if the address names one. */
export function leavingAtOf(query: Query): LeavingAt | undefined {
  const entry = only(query['entry']);
  if (only(query['problem']) === undefined || entry === undefined || !uuidShape.test(entry)) {
    return undefined;
  }
  const leftOn = only(query['leftOn']) ?? '';
  return { entry: entry.toLowerCase(), leftOn: dateShape.test(leftOn) ? leftOn : '' };
}

/** The text of what went well, from the address; undefined when nothing did or the word is not ours. */
export function doneKey(query: Query): TextKey | undefined {
  const word = only(query['done']);
  const found = doneNames.find((name) => name === word);
  return found === undefined ? undefined : (`adminTeams.done.${found}` as TextKey);
}

/**
 * The text of a refusal, from the address: the command's own message when the message
 * file has one, else the message for the code alone, else "that could not be done".
 */
export function problemKey(query: Query): TextKey | undefined {
  const word = only(query['problem']);
  if (word === undefined || word === '' || word.length > 120) return undefined;
  const english = catalogs['en'] ?? {};
  const code = word.slice(word.lastIndexOf('.') + 1);
  for (const key of [`error.${word}`, `error.${code}`]) {
    if (Object.hasOwn(english, key)) return key as TextKey;
  }
  return 'error.unknown';
}
