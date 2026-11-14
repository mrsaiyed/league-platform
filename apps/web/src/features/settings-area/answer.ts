// What a League settings form answers with, and how that answer travels in the address
// (step 2.48): the same two fixed words as the Teams screens use, `done` and `problem`.
// The page turns the word into text from the message files; it never shows anything the
// person typed (T-187).
import { catalogs } from '@srleagues/site';
import type { TextKey } from '../../server/messages.ts';

export const doneNames = ['saved', 'cleared'] as const;
export type DoneName = (typeof doneNames)[number];

export type Answer =
  | { readonly kind: 'done'; readonly done: DoneName }
  | { readonly kind: 'refused'; readonly command: string; readonly code: string };

export const done = (name: DoneName): Answer => ({ kind: 'done', done: name });

export const refused = (command: string, code: string): Answer => ({
  kind: 'refused',
  command,
  code,
});

/** The part of the address that carries an answer: `?done=saved` or `?problem=...`. */
export function answerQuery(answer: Answer): string {
  return answer.kind === 'done'
    ? `?done=${answer.done}`
    : `?problem=${encodeURIComponent(`${answer.command}.${answer.code}`)}`;
}

type Query = Readonly<Record<string, string | string[] | undefined>>;

const only = (value: string | string[] | undefined): string | undefined =>
  typeof value === 'string' ? value : undefined;

export function doneKey(query: Query): TextKey | undefined {
  const found = doneNames.find((name) => name === only(query['done']));
  return found === undefined ? undefined : (`adminSettings.done.${found}` as TextKey);
}

/** The command's own message when the message file has one, else the code's, else "could not be done". */
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
