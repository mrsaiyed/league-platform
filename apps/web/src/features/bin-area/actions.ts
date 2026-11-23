'use server';
// "Bring it back" (step 2.77, A-5): each kind's own restore command (a division's on the
// settings' store, a venue's and a court's on the schedule's, the rest on the bin's), which check again
// that this person may restore that kind of thing. Who is asking and which league come
// from the session; the form only says which thing. Someone with no admin page is refused
// before anything runs (loadLeaguePage); each restore then checks its own permission. The browser goes back to the
// bin with the answer in the address: only the kind, the thing's id and a refusal's code,
// never a name. A plain form, so it works with no script in the page.
import {
  leagueUrl,
  restoreCourt,
  restoreDivision,
  restoreGame,
  restorePerson,
  restoreTeam,
  restoreVenue,
} from '@srleagues/core';
import { redirect } from 'next/navigation';
import { noticeHolderOf, savedNoticesHere } from '../../server/saved-notice.ts';
import { gameBackSaid } from './bin-view.ts';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { fieldsOf } from '../teams-area/run-teams-action.ts';

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function bringBackAction(form: FormData): Promise<never> {
  const fields = fieldsOf(form);
  const view = await loadLeaguePage(fields['league'] ?? '', 'admin');
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
          : kind === 'division'
            ? {
                name: restoreDivision.commandName,
                done: await restoreDivision(
                  context,
                  { divisionId: id },
                  (await webPorts()).adminSettings.deps,
                ),
              }
            : kind === 'venue'
              ? {
                  name: restoreVenue.commandName,
                  done: await restoreVenue(
                    context,
                    { venueId: id },
                    (await webPorts()).scheduleAdmin.deps,
                  ),
                }
              : kind === 'court'
                ? {
                    name: restoreCourt.commandName,
                    done: await restoreCourt(
                      context,
                      { courtId: id },
                      (await webPorts()).scheduleAdmin.deps,
                    ),
                  }
                : undefined;
  if (result === undefined) return redirect(bin);
  if (result.done.ok) {
    // A game brought back is a schedule change (A-19): the page says its revision, the
    // teams and people it reaches (A-7) and names the games now at its time. They are
    // kept on the server for the next page, never in the address, so a crafted link
    // cannot make the notice say a revision that was not made.
    const game = 'revision' in result.done.value ? result.done.value : undefined;
    const holder = noticeHolderOf(context);
    if (game !== undefined && game.revision !== null && holder !== undefined) {
      savedNoticesHere().leave(holder, {
        screen: 'bin',
        thing: id,
        said: gameBackSaid({
          revision: game.revision,
          teams: game.teamCount,
          people: game.peopleCount,
        }),
        name: game.seasonId,
        ...(game.clashes.length === 0 ? {} : { about: game.clashes.map((c) => c.id) }),
      });
    }
    const said = '';
    return redirect(`${bin}?back=${kind}&id=${id}${said}`);
  }
  const why = encodeURIComponent(`${result.name}.${result.done.error.code}`);
  return redirect(`${bin}?not=${id}&why=${why}#bin-${id}`);
}
