'use server';
// "Bring it back" (step 2.77, A-5): the bin's own restore commands, which check again
// that this person may restore that kind of thing. Who is asking and which league come
// from the session; the form only says which thing. League settings is refused to anyone
// it is not open to before anything runs (loadLeaguePage). The browser goes back to the
// bin with the answer in the address: only the kind, the thing's id and a refusal's code,
// never a name. A plain form, so it works with no script in the page.
import { leagueUrl, restoreGame, restorePerson, restoreTeam } from '@srleagues/core';
import { redirect } from 'next/navigation';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { fieldsOf } from '../teams-area/run-teams-action.ts';

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function bringBackAction(form: FormData): Promise<never> {
  const fields = fieldsOf(form);
  const view = await loadLeaguePage(fields['league'] ?? '', 'admin', 'settings');
  const context = commandContextOf(view.context);
  // The bin's commands on the bin's own store: the port People's "Put them back" runs on.
  const deps = (await webPorts()).adminPeople.putBack;
  const bin = leagueUrl(view.context.league, 'admin-area', { area: 'settings', subpath: ['bin'] });
  const id = (fields['id'] ?? '').trim().toLowerCase();
  const kind = fields['kind'];
  if (!uuidShape.test(id)) return redirect(bin);
  const result =
    kind === 'team'
      ? { name: restoreTeam.commandName, done: await restoreTeam(context, { teamId: id }, deps) }
      : kind === 'person'
        ? {
            name: restorePerson.commandName,
            done: await restorePerson(context, { personId: id }, deps),
          }
        : kind === 'game'
          ? {
              name: restoreGame.commandName,
              done: await restoreGame(context, { gameId: id }, deps),
            }
          : undefined;
  if (result === undefined) return redirect(bin);
  if (result.done.ok) return redirect(`${bin}?back=${kind}&id=${id}`);
  const why = encodeURIComponent(`${result.name}.${result.done.error.code}`);
  return redirect(`${bin}?not=${id}&why=${why}#bin-${id}`);
}
