'use server';
// Season settings' server action (step 2.182, A-18): the answer "Yes" to "Show … to
// visitors?" or "Hide … from visitors?". A plain form post, so it works with no script in
// the page. The league and the person come from the session (T-23): the form's league
// only says which page this is, and the page check (loadLeaguePage) refuses it unless the
// person may open Season settings. It runs the season command (update-season), which
// checks `season.settings` at the season's program and the version the person saw (A-8).
// Showing makes a draft season active and hiding makes an active one draft again
// (season-visibility.ts); when the season's state no longer fits the wish, nothing changes.
import { getSeason, updateSeason } from '@srleagues/core';
import { redirect } from 'next/navigation';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { answerParams, done, refusedBy, refusedHere, type Answer } from './answer.ts';
import { seasonSettingsAddress, visibilityAnchor } from './season-settings-address.ts';
import { isVisibilityWish, statusFor } from './season-visibility.ts';

/** A form's text fields; files and repeated names are ignored. */
function fieldsOf(form: FormData): Readonly<Record<string, string>> {
  const fields: Record<string, string> = {};
  for (const [name, value] of form.entries()) {
    if (typeof value === 'string' && !Object.hasOwn(fields, name)) fields[name] = value;
  }
  return fields;
}

export async function changeVisibilityAction(form: FormData): Promise<never> {
  const fields = fieldsOf(form);
  const view = await loadLeaguePage(fields['league'] ?? '', 'admin', 'season');
  const { adminSettings } = await webPorts();
  const context = commandContextOf(view.context);
  const wish = fields['wish'];
  const seasonId = fields['seasonId'] ?? '';
  const version = Number(fields['version']);
  const read = await getSeason(context, { seasonId }, adminSettings.deps);
  let answer: Answer;
  if (!read.ok) answer = refusedBy(updateSeason.commandName, read.error.code);
  else if (!isVisibilityWish(wish)) answer = refusedBy(updateSeason.commandName, 'invalid-input');
  else {
    const status = statusFor(read.value.status, wish);
    if (status === undefined) answer = refusedHere(wish === 'show' ? 'not-hidden' : 'not-shown');
    else {
      const result = await updateSeason(context, { seasonId, version, status }, adminSettings.deps);
      answer = result.ok
        ? done(wish === 'show' ? 'shown' : 'hidden')
        : refusedBy(updateSeason.commandName, result.error.code);
    }
  }
  // The season's own short name, as read: never anything typed into the form.
  const slug = read.ok ? read.value.slug : undefined;
  const address = seasonSettingsAddress(view.context.league, slug, answerParams(answer));
  return redirect(`${address}#${visibilityAnchor}`);
}
