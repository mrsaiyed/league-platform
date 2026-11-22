// Runs one schedule button for the signed-in person and sends the browser back to the
// grid with how it went. The league and person come from the session (loadLeaguePage
// checks the form was posted to the schedule page of the league it names), never from
// the form's fields.
//
// Most answers still ride in the address (step 2.155 part 2 moves the rest). A game
// removed, put back or already back is answered by a one-time notice (record 067, step
// 2.185), so a reload or the phone's Back never shows an old "Removed … Put it back":
// - scripts off: post, redirect, get, to the grid's "Saved" (#saved);
// - scripts on: when the page the post came from is the grid's own plain address, it is
//   drawn again in the answer to the post (Next.js's refresh): Next.js does not draw a page
//   sent to its own address again when only the place on it (#…) differs. Otherwise (the
//   address still holds an older answer) the browser is sent to the plain address.
import { leagueUrl } from '@srleagues/core';
import { refresh } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { noticeHolderOf, savedNoticesHere } from '../../server/saved-notice.ts';
import { backToTeamId, backToTeamParam } from './back-to-team.ts';
import { answerParams, noticeOfAnswer } from './grid-answer.ts';
import { runScheduleAction, type ScheduleActionKind } from './run-schedule-action.ts';

export async function performScheduleAction(
  kind: ScheduleActionKind,
  form: FormData,
): Promise<void> {
  const league = form.get('league');
  const view = await loadLeaguePage(typeof league === 'string' ? league : '', 'admin', 'schedule');
  const ports = await webPorts();
  const context = commandContextOf(view.context);
  const outcome = await runScheduleAction(kind, form, context, ports.scheduleAdmin.deps);
  const season = form.get('season');
  const query = new URLSearchParams();
  if (typeof season === 'string' && season !== '') query.set('season', season);
  // The team "Remove this team" came from, so the way back stays offered (step 2.180).
  const fromTeam = backToTeamId(form.get(backToTeamParam));
  if (fromTeam !== undefined) query.set(backToTeamParam, fromTeam);
  const answer = answerParams(outcome);
  for (const [name, value] of Object.entries(answer.query)) query.set(name, value);
  const base = leagueUrl(view.context.league, 'admin-area', { area: 'schedule' });
  const address = `${base}?${query.toString()}`;
  const notice = noticeOfAnswer(outcome);
  const holder = noticeHolderOf(context);
  if (notice !== undefined && holder !== undefined) {
    savedNoticesHere().leave(holder, { screen: 'schedule', ...notice });
    const asked = await headers();
    // Next.js's own header on a post its scripts send; a form sent by the browser has none.
    if (asked.has('next-action') && sameAddress(asked.get('referer'), address)) {
      refresh();
      return;
    }
  }
  redirect(`${address}${answer.hash}`);
}

/** Whether the page a post came from is `address` (its path and query; the place aside). */
function sameAddress(from: string | null, address: string): boolean {
  if (from === null) return false;
  try {
    const was = new URL(from);
    const to = new URL(address, was);
    return was.pathname === to.pathname && was.search === to.search;
  } catch {
    return false;
  }
}
