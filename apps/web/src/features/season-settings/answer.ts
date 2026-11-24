// What a Season settings form answers with, and how that answer travels in the address
// (step 2.182): `?done=shown`, `?done=hidden`, or `?problem=` with the command's name and
// code, or one of the screen's own words when the season's state no longer fits the wish.
// The page turns the word into text from the message files; it never shows anything the
// person typed (T-187).
import { catalogs } from '@srleagues/site';
import type { TextKey } from '../../server/messages.ts';
import type { Visibility } from './season-visibility.ts';

export const doneNames = ['shown', 'hidden', 'started', 'current', 'archived'] as const;
export type DoneName = (typeof doneNames)[number];

/** The screen's own refusals: the wish does not fit the season's state now. */
export const screenRefusals = ['not-hidden', 'not-shown', 'not-archivable'] as const;
export type ScreenRefusal = (typeof screenRefusals)[number];

export type Answer =
  | { readonly kind: 'done'; readonly done: DoneName }
  | { readonly kind: 'refused'; readonly word: string };

export const done = (name: DoneName): Answer => ({ kind: 'done', done: name });
export const refusedBy = (command: string, code: string): Answer => ({
  kind: 'refused',
  word: `${command}.${code}`,
});
export const refusedHere = (why: ScreenRefusal): Answer => ({ kind: 'refused', word: why });

/** The part of the address that carries an answer, after the season's own `season=`. */
export function answerParams(answer: Answer): Readonly<Record<string, string>> {
  return answer.kind === 'done' ? { done: answer.done } : { problem: answer.word };
}

type Query = Readonly<Record<string, string | readonly string[] | undefined>>;

const only = (value: string | readonly string[] | undefined): string | undefined =>
  typeof value === 'string' ? value : undefined;

export function doneOf(query: Query): DoneName | undefined {
  return doneNames.find((name) => name === only(query['done']));
}

/**
 * The done word only when the season, read fresh, is as it says: "shown" for a season
 * visitors may see, "hidden" for one they may not. An address alone never makes the page
 * say something happened that did not.
 */
export function earnedDone(query: Query, visibility: Visibility): DoneName | undefined {
  const said = doneOf(query);
  if (said === 'shown') return visibility === 'shown' ? said : undefined;
  if (said === 'hidden') return visibility === 'hidden' ? said : undefined;
  // A season just started is hidden until shown (step 2.130, A-18).
  if (said === 'started') return visibility === 'hidden' ? said : undefined;
  return undefined;
}

/** The same for "current" and "archived" (step 2.130): only when the season, read fresh, is so. */
export function earnedStateDone(
  query: Query,
  season: { readonly isCurrent: boolean; readonly archived: boolean },
): DoneName | undefined {
  const said = doneOf(query);
  if (said === 'current') return season.isCurrent ? said : undefined;
  if (said === 'archived') return season.archived ? said : undefined;
  return undefined;
}

/**
 * The words for `?problem=`: the screen's own when it is one of them, else the command's
 * message when the message file has one, else the code's, else "could not be done".
 */
export function problemKey(query: Query): TextKey | undefined {
  const word = only(query['problem']);
  if (word === undefined || word === '' || word.length > 120) return undefined;
  const here = screenRefusals.find((name) => name === word);
  if (here !== undefined) return `seasonSettings.refused.${here}`;
  const english = catalogs['en'] ?? {};
  const code = word.slice(word.lastIndexOf('.') + 1);
  for (const key of [`error.${word}`, `error.${code}`]) {
    if (Object.hasOwn(english, key)) return key as TextKey;
  }
  return 'error.unknown';
}
