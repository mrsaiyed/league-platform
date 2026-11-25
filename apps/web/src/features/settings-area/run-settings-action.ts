// The one place a League settings form is carried out (step 2.48). The league and the
// person come from the session (T-23): the route's league only says which page this is,
// and the page check (loadLeaguePage) refuses it unless the person may open the
// settings area. A change then runs as a command on the app's own transaction, its answer
// is left as the one-time notice (answer.ts, never the address, step 2.155 part 6) and the
// browser is sent back to the page. Plain forms, so it all works with no script in the page.
import { leagueUrl, type CommandContext } from '@srleagues/core';
import { redirect } from 'next/navigation';
import type { AdminSettingsPorts } from '../../server/admin-settings.ts';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { noticeHolderOf, savedNoticesHere } from '../../server/saved-notice.ts';
import { answerQuery, leagueStatusThing, type Answer } from './answer.ts';
import type { Fields } from './form-input.ts';

export type SettingsAction = {
  readonly context: CommandContext;
  readonly ports: AdminSettingsPorts;
  readonly fields: Fields;
};

/** A form's text fields; files and repeated names are ignored. */
export function fieldsOf(form: FormData): Fields {
  const fields: Record<string, string> = {};
  for (const [name, value] of form.entries()) {
    if (typeof value === 'string' && !Object.hasOwn(fields, name)) fields[name] = value;
  }
  return fields;
}

export async function runSettingsAction(
  form: FormData,
  work: (action: SettingsAction) => Promise<Answer>,
): Promise<never> {
  const fields = fieldsOf(form);
  const view = await loadLeaguePage(fields['league'] ?? '', 'admin', 'settings');
  const { adminSettings: ports } = await webPorts();
  const context = commandContextOf(view.context);
  const answer = await work({ context, ports, fields });
  const holder = noticeHolderOf(context);
  if (holder !== undefined) {
    savedNoticesHere().leave(holder, {
      screen: 'settings',
      thing: leagueStatusThing,
      said: answerQuery(answer),
    });
  }
  return redirect(leagueUrl(view.context.league, 'admin-area', { area: 'settings' }));
}
