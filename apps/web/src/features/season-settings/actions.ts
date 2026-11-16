'use server';
// Season settings' server action (step 2.182, A-18): the answer "Yes" to "Show … to
// visitors?" or "Hide … from visitors?". A plain form post, so it works with no script in
// the page. The league and the person come from the session (T-23): the form's league
// only says which page this is, and the page check (loadLeaguePage) refuses it unless the
// person may open Season settings. The change itself is runVisibilityChange: the season
// read fresh, nothing changed when its state no longer fits the wish, else the season
// command (update-season) with the version the person saw (A-8).
import { redirect } from 'next/navigation';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { answerParams } from './answer.ts';
import { runVisibilityChange } from './run-visibility-change.ts';
import { seasonSettingsAddress, visibilityAnchor } from './season-settings-address.ts';

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
  const { answer, seasonSlug } = await runVisibilityChange(
    commandContextOf(view.context),
    fields,
    adminSettings.deps,
  );
  const address = seasonSettingsAddress(view.context.league, seasonSlug, answerParams(answer));
  return redirect(`${address}#${visibilityAnchor}`);
}
