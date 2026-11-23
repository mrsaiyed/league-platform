'use server';
// The adjustments forms' server actions (step 2.56). Who is asking and in which league come
// from the session and the address (loadLeaguePage, the Standings and stats area), never
// from the form; the form only says which season, team or adjustment and what to do. Each
// runs the standings module's own command, once per request (server/same-request.ts), and
// is answered as record 067 says (../list-forms): refused in the response to the post with
// what was typed and the wrong box marked, or saved with a one-time notice in the list.
import {
  addAdjustment,
  listAdjustments,
  removeAdjustment,
  type CommandContext,
  type Result,
} from '@srleagues/core';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import { requestKeyOf, sameRequestsHere } from '../../server/same-request.ts';
import {
  answerSaved,
  refusedWith,
  typedOf,
  type FormState,
  type TypedFields,
} from '../list-forms/index.ts';
import {
  adjustmentLimitWords,
  adjustmentProblemKey,
  readCounts,
  reasonProblem,
  wrongAdjustmentFields,
} from './adjustment-answers.ts';
import { adjustmentWhat } from './adjustment-text.ts';
import { adjustmentsListAnchor, standingsAreaAddress } from './standings-address.ts';

type Outcome = Result<unknown, { readonly code: string }> & {
  readonly name?: string;
  readonly box?: string;
};
const requests = () => sameRequestsHere<Outcome>();
const text = (fields: TypedFields, name: string) => (fields[name] ?? '').trim();
const refuse = (code: string, box?: string): Outcome => ({
  ok: false,
  error: { code },
  ...(box === undefined ? {} : { box }),
});

/** The Standings and stats area of the league the form came from, checked by the gate. */
async function standingsOf(fields: TypedFields) {
  const view = await loadLeaguePage(fields['league'] ?? '', 'admin', 'standings');
  const ports = await webPorts();
  const slug = text(fields, 'seasonSlug');
  return {
    context: commandContextOf(view.context),
    leagueId: view.context.league.id,
    deps: ports.games.standingsDeps,
    teamsOf: ports.scheduleAdmin.teamsOf,
    page: standingsAreaAddress(view.context.league, slug === '' ? undefined : slug),
  };
}

async function answer(
  fields: TypedFields,
  said: 'added' | 'removed',
  run: (context: CommandContext) => Promise<Outcome>,
): Promise<FormState> {
  const { context, page } = await standingsOf(fields);
  const outcome = await requests().once(requestKeyOf(context, fields), () => run(context));
  if (!outcome.ok) {
    const code = outcome.error.code;
    return refusedWith(
      code,
      fields,
      wrongAdjustmentFields(code, outcome.box),
      code === 'number-too-big'
        ? t(adjustmentProblemKey(code), adjustmentLimitWords)
        : t(adjustmentProblemKey(code)),
    );
  }
  return answerSaved(
    context,
    {
      screen: 'standings',
      thing: text(fields, 'season'),
      said,
      ...(outcome.name === undefined ? {} : { name: outcome.name }),
    },
    `${page}#${adjustmentsListAnchor}`,
  );
}

export async function addAdjustmentAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { deps, leagueId, teamsOf } = await standingsOf(fields);
  const seasonId = text(fields, 'season');
  return answer(fields, 'added', async (context) => {
    const teamId = text(fields, 'team');
    if (teamId === '') return refuse('team-not-found', 'team');
    const counts = readCounts(fields);
    if (!counts.ok) return refuse(counts.code, counts.box);
    const reasonWrong = reasonProblem(fields['reason']);
    if (reasonWrong !== undefined) return refuse(reasonWrong, 'reason');
    const result = await addAdjustment(
      context,
      { seasonId, teamId, ...counts.counts, reason: text(fields, 'reason') },
      deps,
    );
    if (!result.ok) return result;
    const team = (await teamsOf(leagueId, seasonId)).find((x) => x.id === teamId)?.name ?? '';
    return { ...result, name: adjustmentWhat(team, counts.counts) };
  });
}

/** Off the season, after the tick and with a reason kept in the activity log. */
export async function removeAdjustmentAction(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const fields = typedOf(form);
  const { deps, leagueId, teamsOf } = await standingsOf(fields);
  const seasonId = text(fields, 'season');
  const adjustmentId = text(fields, 'adjustment');
  return answer(fields, 'removed', async (context) => {
    const reasonWrong = reasonProblem(fields['reason']);
    if (reasonWrong !== undefined) return refuse(reasonWrong, 'reason');
    if (fields['confirm'] !== 'yes') return refuse('not-confirmed');
    // What it changed, read before it goes: the answer names what was taken off.
    const listed = await listAdjustments(context, { seasonId }, deps);
    const gone = listed.ok
      ? listed.value.adjustments.find((a) => a.id === adjustmentId)
      : undefined;
    const result = await removeAdjustment(
      context,
      { seasonId, adjustmentId, reason: text(fields, 'reason') },
      deps,
    );
    if (!result.ok || gone === undefined) return result;
    const team = (await teamsOf(leagueId, seasonId)).find((x) => x.id === gone.teamId)?.name ?? '';
    return { ...result, name: adjustmentWhat(team, gone) };
  });
}
