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
import type { CommandContext, LeagueAddressee } from '@srleagues/core';
import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { requestKeyOf, sameRequestsHere } from '../../server/same-request.ts';
import { noticeHolderOf, savedNoticesHere } from '../../server/saved-notice.ts';
import { answerSaid, seasonAnswerThing, type Answer } from './answer.ts';
import { typedOf, untouched, type PartState } from './part-form-state.ts';
import type { MovedTeam } from './part-words.ts';
import { runPartSave, type PartSaveResult } from './run-part-save.ts';
import { runSeasonChange } from './run-season-change.ts';
import { runStartSeason } from './run-start-season.ts';
import { runVisibilityChange } from './run-visibility-change.ts';
import { partAnchor } from './season-parts.ts';
import {
  seasonSettingsAddress,
  seasonStateAnchor,
  startSeasonAnchor,
  visibilityAnchor,
} from './season-settings-address.ts';

/**
 * Leaves a visibility, current-or-archived or start answer as the one-time notice (step 2.155
 * part 6, T-437) and gives the season's address with no answer in it: a reload says nothing.
 */
function answeredAt(
  context: CommandContext,
  league: LeagueAddressee,
  seasonSlug: string | undefined,
  answer: Answer,
): string {
  const holder = noticeHolderOf(context);
  if (holder !== undefined) {
    savedNoticesHere().leave(holder, {
      screen: 'season',
      thing: seasonAnswerThing(seasonSlug),
      said: answerSaid(answer),
    });
  }
  return seasonSettingsAddress(league, seasonSlug);
}

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
  const { answer, seasonSlug } = await runVisibilityChange(context, fields, adminSettings.deps);
  const address = answeredAt(context, view.context.league, seasonSlug, answer);
  return redirect(`${address}#${visibilityAnchor}`);
}

/** "Yes" to "Make … the current season?" or "Archive …?" (step 2.130). */
export async function changeSeasonAction(form: FormData): Promise<never> {
  const fields = fieldsOf(form);
  const view = await loadLeaguePage(fields['league'] ?? '', 'admin', 'season');
  const { adminSettings } = await webPorts();
  const context = commandContextOf(view.context);
  const { answer, seasonSlug } = await runSeasonChange(context, fields, adminSettings.deps);
  const address = answeredAt(context, view.context.league, seasonSlug, answer);
  return redirect(`${address}#${seasonStateAnchor}`);
}

/**
 * "Start the season" (step 2.130): made, the page opens on the new season and says it is
 * ready and hidden, at the panel with "Show this season to visitors" (step 2.182); refused,
 * the page says why at the form. A post sent twice is answered as the first.
 */
export async function startSeasonAction(form: FormData): Promise<never> {
  const fields = fieldsOf(form);
  const view = await loadLeaguePage(fields['league'] ?? '', 'admin', 'season');
  const context = commandContextOf(view.context);
  const { adminSettings } = await webPorts();
  const { answer, seasonSlug } = await sameRequestsHere<
    Awaited<ReturnType<typeof runStartSeason>>
  >().once(requestKeyOf(context, fields), () =>
    runStartSeason(context, fields, adminSettings.deps),
  );
  const address = answeredAt(context, view.context.league, seasonSlug, answer);
  return redirect(`${address}#${answer.kind === 'done' ? visibilityAnchor : startSeasonAnchor}`);
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
