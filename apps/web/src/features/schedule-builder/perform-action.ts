// Runs one schedule button for the signed-in person and sends the browser back to the
// grid with how it went. The league and person come from the session (loadLeaguePage
// checks the form was posted to the schedule page of the league it names), never from
// the form's fields.
//
// No answer rides in the address (step 2.155 part 6, T-434): every one, a refusal and what
// was typed in its form too, is a one-time notice (grid-answer.ts), and a game removed, put
// back or already back a notice of its own (record 067, step 2.185), so a reload or the
// phone's Back never says an old answer:
// - scripts off: post, redirect, get, to the grid's place for it (#saved, #round-…);
// - scripts on: when the page the post came from is the grid's own address, it is drawn
//   again in the answer to the post (Next.js's refresh): Next.js does not draw a page sent
//   to its own address again when only the place on it (#…) differs. Otherwise (an address
//   with old words in it) the browser is sent to the plain address.
// A button pressed twice is the same request, answered as the first while that answer is
// still true of the draft (gridAnswerHolds), else run again.
import { getScheduleDraft, leagueUrl } from '@srleagues/core';
import { refresh } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { requestKeyOf, sameRequestsHere } from '../../server/same-request.ts';
import { noticeHolderOf, savedNoticesHere } from '../../server/saved-notice.ts';
import { typedOf } from '../list-forms/index.ts';
import { backToTeamId, backToTeamParam } from './back-to-team.ts';
import { answerParams, answerSaid, gridAnswerHolds, noticeOfAnswer } from './grid-answer.ts';
import {
  runScheduleAction,
  type ScheduleActionKind,
  type ScheduleActionOutcome,
} from './run-schedule-action.ts';

export async function performScheduleAction(
  kind: ScheduleActionKind,
  form: FormData,
): Promise<void> {
  const league = form.get('league');
  const view = await loadLeaguePage(typeof league === 'string' ? league : '', 'admin', 'schedule');
  const ports = await webPorts();
  const context = commandContextOf(view.context);
  // A second post of the same form for the same button (a double tap) is answered as the
  // first while that answer still holds, so it saves once (step 2.155; server/same-request.ts).
  const deps = ports.scheduleAdmin.deps;
  const outcome = await sameRequestsHere<ScheduleActionOutcome>().once(
    requestKeyOf(context, { ...typedOf(form), gridButton: kind }),
    () => runScheduleAction(kind, form, context, deps),
    async (kept) => {
      const seasonId = form.get('seasonId');
      if (typeof seasonId !== 'string' || seasonId === '') return kept.kind === 'refused';
      const now = await getScheduleDraft(context, { seasonId }, deps);
      return now.ok && gridAnswerHolds(kept, now.value);
    },
  );
  const season = form.get('season');
  const query = new URLSearchParams();
  if (typeof season === 'string' && season !== '') query.set('season', season);
  // The team "Remove this team" came from, so the way back stays offered (step 2.180).
  const fromTeam = backToTeamId(form.get(backToTeamParam));
  if (fromTeam !== undefined) query.set(backToTeamParam, fromTeam);
  const answer = answerParams(outcome);
  const base = leagueUrl(view.context.league, 'admin-area', { area: 'schedule' });
  const address = query.size === 0 ? base : `${base}?${query.toString()}`;
  const holder = noticeHolderOf(context);
  if (holder !== undefined) {
    savedNoticesHere().leave(holder, {
      screen: 'schedule',
      ...(noticeOfAnswer(outcome) ?? { thing: base, said: answerSaid(outcome) }),
    });
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
