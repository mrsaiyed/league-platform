// How a form of the divisions and venues screens is answered on the server (step 2.49;
// T-271, record 067), as the games area answers its own:
// - refused: in the response to the post itself, with what was typed (form-state.ts); the
//   screen is drawn again as it is now (Next.js's refresh) unless the refusal is only a
//   typing mistake, so what someone else changed meanwhile shows (A-8);
// - saved: a one-time notice that says only which screen, which thing and what was done is
//   left for the person, and the screen is drawn again from what is saved: in the answer to
//   the post when the app's own scripts sent it, else by sending the browser to the
//   thing's place on it (post, redirect, get). Nothing of it rides in the address.
import type { CommandContext } from '@srleagues/core';
import { refresh } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  noticeHolderOf,
  savedNoticesHere,
  type NoticeScreen,
  type SavedNotice,
} from '../../server/saved-notice.ts';
import type { FormState, TypedFields } from './form-state.ts';

/** A refusal drawn from the post; a typing mistake leaves the rest of the screen as it is. */
export function refusedWith(
  code: string,
  typed: TypedFields,
  wrong: readonly string[],
  said: string,
): FormState {
  if (code !== 'invalid-input' && code !== 'not-confirmed') refresh();
  return { kind: 'refused', code, typed, wrong, said };
}

/** Leaves the notice and draws the screen again, at `to` (its address and the thing's #…). */
export async function answerSaved(
  context: CommandContext,
  notice: SavedNotice,
  to: string,
): Promise<FormState> {
  const holder = noticeHolderOf(context);
  if (holder !== undefined) savedNoticesHere().leave(holder, notice);
  // Next.js's own header on a post its scripts send; a form sent by the browser has none.
  if ((await headers()).has('next-action')) {
    refresh();
    return { kind: 'untouched' };
  }
  return redirect(to);
}

/**
 * Leaves the notice and sends the browser to `to`, with scripts on or off (step 2.155): a
 * thing just made has a page of its own, and its "Saved" is said there, at the top, beside
 * its name. As answerSaved, nothing of it rides in the address; a reload says nothing old.
 */
export function answerSavedAt(context: CommandContext, notice: SavedNotice, to: string): never {
  const holder = noticeHolderOf(context);
  if (holder !== undefined) savedNoticesHere().leave(holder, notice);
  return redirect(to);
}

/** The notice left for this person on this screen, taken: a reload says nothing old. */
export function takeNotice(context: CommandContext, screen: NoticeScreen) {
  const holder = noticeHolderOf(context);
  return holder === undefined ? undefined : savedNoticesHere().take(holder, screen);
}
