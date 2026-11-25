// The one place a Teams form is carried out (step 2.51). The league and the person come
// from the session (T-23): the route's league only says which page this is, and the
// page check (loadLeaguePage) refuses it unless the person may open the Teams area. A
// change then runs as a command on the app's own transaction, and the browser is sent
// back to the page; the answer is a one-time notice kept on the server, never the address
// (answer-notice.ts, T-435). A form sent twice (its one-time token, LeagueField) is the same
// request, answered as the first while that answer still holds (server/same-request.ts).
// Plain forms, so it all works with no script in the page.
import { leagueUrl, listRoster, type CommandContext } from '@srleagues/core';
import { refresh } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { AdminTeamsPorts } from '../../server/admin-teams.ts';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { noticeHolderOf, savedNoticesHere } from '../../server/saved-notice.ts';
import { requestKeyOf, sameRequestsHere } from '../../server/same-request.ts';
import type { Answer } from './answer.ts';
import { answerHolds, teamsAnswerSaid, teamsListThing, type KeptTruth } from './answer-notice.ts';
import type { Fields } from './form-input.ts';

export type TeamsAction = {
  readonly context: CommandContext;
  readonly ports: AdminTeamsPorts;
  /** The league's current season, or undefined when it has none. */
  readonly seasonId: string | undefined;
  readonly fields: Fields;
};

/** What to tell the person, and which team's page to go back to (the list when none). */
export type TeamsActionResult = {
  readonly answer: Answer;
  readonly teamId?: string | undefined;
  /** What the answer needs to be given again to a second post (answerHolds). */
  readonly truth?: KeptTruth;
};

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A form's text fields; files and repeated names are ignored. */
export function fieldsOf(form: FormData): Fields {
  const fields: Record<string, string> = {};
  for (const [name, value] of form.entries()) {
    if (typeof value === 'string' && !Object.hasOwn(fields, name)) fields[name] = value;
  }
  return fields;
}

export async function runTeamsAction(
  form: FormData,
  work: (action: TeamsAction) => Promise<TeamsActionResult>,
): Promise<void> {
  const fields = fieldsOf(form);
  const view = await loadLeaguePage(fields['league'] ?? '', 'admin', 'teams');
  const { adminTeams: ports } = await webPorts();
  const context = commandContextOf(view.context);
  const season = await ports.currentSeason(context);
  const result = await sameRequestsHere<TeamsActionResult>().once(
    requestKeyOf(context, fields),
    () => work({ context, ports, seasonId: season?.id, fields }),
    async (kept) => {
      const team = (kept.teamId ?? fields['team'] ?? '').toLowerCase();
      const [teams, roster] = await Promise.all([
        season === undefined ? Promise.resolve([]) : ports.teams(context, season.id),
        uuidShape.test(team) ? listRoster(context, { teamId: team }, ports.deps) : undefined,
      ]);
      return answerHolds(
        kept.answer,
        {
          lines: roster?.ok === true ? roster.value : undefined,
          team: teams.find((candidate) => candidate.id === team),
        },
        kept.truth,
      );
    },
  );
  const teamId =
    result.teamId !== undefined && uuidShape.test(result.teamId)
      ? result.teamId.toLowerCase()
      : undefined;
  const address = leagueUrl(view.context.league, 'admin-area', {
    area: 'teams',
    ...(teamId === undefined ? {} : { subpath: [teamId] }),
  });
  const { said, anchor } = teamsAnswerSaid(result.answer);
  const holder = noticeHolderOf(context);
  if (holder !== undefined) {
    savedNoticesHere().leave(holder, { screen: 'teams', thing: teamId ?? teamsListThing, said });
  }
  const asked = await headers();
  // A post from the page's own scripts (Next.js's header) back to the page it came from:
  // a redirect there changes the address only by its #…, which the browser takes as a mere
  // scroll, so the screen and its notice would not be drawn again. It is drawn again in
  // place instead (as the schedule does); with no script, the redirect loads the page.
  if (asked.has('next-action') && sameAddress(asked.get('referer'), address)) {
    refresh();
    return;
  }
  redirect(`${address}${anchor}`);
}

/** Whether the page a post came from is `address` (its path and query; the #… aside). */
export function sameAddress(from: string | null, address: string): boolean {
  if (from === null) return false;
  try {
    const was = new URL(from);
    const to = new URL(address, was);
    return was.pathname === to.pathname && was.search === to.search;
  } catch {
    return false;
  }
}
