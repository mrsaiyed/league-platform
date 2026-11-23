'use server';
// Season settings' server actions.
//
// The visibility panel's (step 2.182, A-18): the answer "Yes" to "Show … to
// visitors?" or "Hide … from visitors?". A plain form post, so it works with no script in
// the page. The league and the person come from the session (T-23): the form's league
// only says which page this is, and the page check (loadLeaguePage) refuses it unless the
// person may open Season settings. The change itself is runVisibilityChange: the season
// read fresh, nothing changed when its state no longer fits the wish, else the season
// command (update-season) with the version the person saw (A-8).
//
// A part of the season's settings (step 2.47): its form's post, answered as record 067
// says (T-271). Refused, or a preset chosen, or the question before a change that moves
// the standings: in the response to the post itself, drawn from what was posted, and
// with the page drawn again as it is now when the season may have changed. Saved: a
// one-time notice for this person (server/saved-notice.ts) and the browser sent to the
// season's settings at that part, where "Saved" is said beside it; nothing about the
// answer rides in the address. A post sent twice is answered as the first
// (server/same-request.ts).
import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { requestKeyOf, sameRequestsHere } from '../../server/same-request.ts';
import { noticeHolderOf, savedNoticesHere } from '../../server/saved-notice.ts';
import { answerParams } from './answer.ts';
import { typedOf, untouched, type PartState } from './part-form-state.ts';
import type { MovedTeam } from './part-words.ts';
import { runPartSave, type PartSaveResult } from './run-part-save.ts';
import { runVisibilityChange } from './run-visibility-change.ts';
import { partAnchor } from './season-parts.ts';
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

export async function savePartAction(_state: PartState, form: FormData): Promise<PartState> {
  const fields = typedOf(form);
  const view = await loadLeaguePage(fields['league'] ?? '', 'admin', 'season');
  const context = commandContextOf(view.context);
  const { adminSettings, adminTeams } = await webPorts();
  const result = await sameRequestsHere<PartSaveResult>().once(requestKeyOf(context, fields), () =>
    runPartSave(context, fields, {
      seasons: adminSettings.seasons,
      teamsOf: async (seasonId) => {
        const [teams, divisions] = await Promise.all([
          adminTeams.teams(context, seasonId),
          adminTeams.divisions(context, seasonId),
        ]);
        const named = new Map(divisions.map((d) => [d.id, d.name]));
        return new Map<string, MovedTeam>(
          teams.map((team) => [
            team.id,
            {
              name: team.name,
              division: team.divisionId === null ? undefined : named.get(team.divisionId),
            },
          ]),
        );
      },
    }),
  );
  if (result.kind === 'answer') {
    if (result.changed) refresh();
    return result.state;
  }
  const holder = noticeHolderOf(context);
  if (holder !== undefined) {
    savedNoticesHere().leave(holder, {
      screen: 'season',
      thing: result.seasonId,
      said: result.part,
    });
  }
  redirect(
    `${seasonSettingsAddress(view.context.league, result.seasonSlug)}#${partAnchor(result.part)}`,
  );
  return untouched;
}
