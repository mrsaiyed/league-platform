// The one place a Teams form is carried out (step 2.51). The league and the person come
// from the session (T-23): the route's league only says which page this is, and the
// page check (loadLeaguePage) refuses it unless the person may open the Teams area. A
// change then runs as a command on the app's own transaction, and the browser is sent
// back to the page with the answer in the address (answer.ts). Plain forms, so it all
// works with no script in the page.
import { leagueUrl, type CommandContext } from '@srleagues/core';
import { redirect } from 'next/navigation';
import type { AdminTeamsPorts } from '../../server/admin-teams.ts';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { answerQuery, type Answer } from './answer.ts';
import type { Fields } from './form-input.ts';

export type TeamsAction = {
  readonly context: CommandContext;
  readonly ports: AdminTeamsPorts;
  /** The league's current season, or undefined when it has none. */
  readonly seasonId: string | undefined;
  readonly fields: Fields;
  /** Today as yyyy-mm-dd, for a leaving date left empty. */
  readonly today: string;
};

/** What to tell the person, and which team's page to go back to (the list when none). */
export type TeamsActionResult = { readonly answer: Answer; readonly teamId?: string };

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
): Promise<never> {
  const fields = fieldsOf(form);
  const view = await loadLeaguePage(fields['league'] ?? '', 'admin', 'teams');
  const { adminTeams: ports } = await webPorts();
  const context = commandContextOf(view.context);
  const season = await ports.currentSeason(context.leagueId);
  const result = await work({
    context,
    ports,
    seasonId: season?.id,
    fields,
    today: new Date().toISOString().slice(0, 10),
  });
  const teamId =
    result.teamId !== undefined && uuidShape.test(result.teamId) ? result.teamId : undefined;
  const address = leagueUrl(view.context.league, 'admin-area', {
    area: 'teams',
    ...(teamId === undefined ? {} : { subpath: [teamId] }),
  });
  return redirect(`${address}${answerQuery(result.answer)}`);
}
