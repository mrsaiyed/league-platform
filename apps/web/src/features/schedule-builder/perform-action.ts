// Runs one schedule button for the signed-in person and sends the browser back to the
// grid with how it went. The league and person come from the session (loadLeaguePage
// checks the form was posted to the schedule page of the league it names), never from
// the form's fields.
import { leagueUrl } from '@srleagues/core';
import { redirect } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { backToTeamId, backToTeamParam } from './back-to-team.ts';
import { answerParams } from './grid-answer.ts';
import { runScheduleAction, type ScheduleActionKind } from './run-schedule-action.ts';

export async function performScheduleAction(
  kind: ScheduleActionKind,
  form: FormData,
): Promise<never> {
  const league = form.get('league');
  const view = await loadLeaguePage(typeof league === 'string' ? league : '', 'admin', 'schedule');
  const ports = await webPorts();
  const outcome = await runScheduleAction(
    kind,
    form,
    commandContextOf(view.context),
    ports.scheduleAdmin.deps,
  );
  const season = form.get('season');
  const query = new URLSearchParams();
  if (typeof season === 'string' && season !== '') query.set('season', season);
  // The team "Remove this team" came from, so the way back stays offered (step 2.180).
  const fromTeam = backToTeamId(form.get(backToTeamParam));
  if (fromTeam !== undefined) query.set(backToTeamParam, fromTeam);
  const answer = answerParams(outcome);
  for (const [name, value] of Object.entries(answer.query)) query.set(name, value);
  const base = leagueUrl(view.context.league, 'admin-area', { area: 'schedule' });
  return redirect(`${base}?${query.toString()}${answer.hash}`);
}
