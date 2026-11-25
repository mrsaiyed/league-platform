// What a Season settings form answers with (step 2.182): `?done=shown`, `?done=hidden`, or
// `?problem=` with the command's name and code, or one of the screen's own words when the
// season's state no longer fits the wish. Since step 2.155 part 6 (T-437) it never rides in
// the address: the form's action leaves it as the server's one-time notice
// (server/saved-notice.ts, screen `season`) for the person who sent it, the page takes it
// once as it is drawn and reads it here, so a reload, Back or an address with `done=` or
// `problem=` in it says nothing. The page turns the word into text from the message files;
// it never shows anything the person typed (T-187).
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

/** The words of an answer, as doneOf and problemKey read them. */
export function answerParams(answer: Answer): Readonly<Record<string, string>> {
  return answer.kind === 'done' ? { done: answer.done } : { problem: answer.word };
}

type Query = Readonly<Record<string, string | readonly string[] | undefined>>;

/** What an answer leaves as the notice's `said`: `?done=shown`, `?problem=…`. */
export function answerSaid(answer: Answer): string {
  return `?${new URLSearchParams(answerParams(answer)).toString()}`;
}

/**
 * The notice's `thing` for an answer about the season with this address name (a part's
 * "Saved" uses the season's id): empty when the season was not found, and the page then
 * shows the season it falls back to, as the address without `season=` did.
 */
export const seasonAnswerThing = (seasonSlug: string | undefined): string =>
  `answer:${seasonSlug ?? ''}`;

/** The answer the page took from the notice, for the season it shows; empty for none or another's. */
export function seasonAnswerOf(
  notice: { readonly thing: string; readonly said: string } | undefined,
  seasonSlug: string | undefined,
): Readonly<Record<string, string>> {
  if (notice === undefined || !notice.said.startsWith('?')) return {};
  const forHere = notice.thing === seasonAnswerThing(seasonSlug);
  if (!forHere && notice.thing !== seasonAnswerThing(undefined)) return {};
  return Object.fromEntries(new URLSearchParams(notice.said.slice(1)));
}

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
