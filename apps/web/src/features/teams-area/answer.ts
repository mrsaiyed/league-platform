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
  'personRemoved',
] as const;
export type DoneName = (typeof doneNames)[number];

export type Answer =
  | { readonly kind: 'done'; readonly done: DoneName }
  | { readonly kind: 'refused'; readonly command: string; readonly code: string };

/** A refusal from a command, as the screen carries it: `teams.mark_left`, `already-left`. */
export function refused(command: string, code: string): Answer {
  return { kind: 'refused', command, code };
}

export function done(name: DoneName): Answer {
  return { kind: 'done', done: name };
}

/** The part of the address that carries an answer: `?done=created` or `?problem=...`. */
export function answerQuery(answer: Answer): string {
  return answer.kind === 'done'
    ? `?done=${answer.done}`
    : `?problem=${encodeURIComponent(`${answer.command}.${answer.code}`)}`;
}

type Query = Readonly<Record<string, string | string[] | undefined>>;

const only = (value: string | string[] | undefined): string | undefined =>
  typeof value === 'string' ? value : undefined;

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
