'use server';
// "Bring it back" (step 2.77, A-5): each kind's own restore command (a division's on the
// settings' store, a venue's and a court's on the schedule's, the rest on the bin's), which check again
// that this person may restore that kind of thing. Who is asking and which league come
// from the session; the form only says which thing. Someone with no admin page is refused
// before anything runs (loadLeaguePage); each restore then checks its own permission. The answer is
// a one-time notice, never the address (bin-answer.ts, T-426): what was brought back is said at the
// top of the bin, where the browser lands; a refusal beside the thing's own row (`#bin-<id>`). Both
// name the thing as the bin listed it. A second tap is the same request, answered as the first
// (server/same-request.ts), while that answer still holds: a tap from an old page after the
// thing was binned again brings it back again. A plain form, so it works with no script in the page.
import {
  leagueUrl,
  restoreCourt,
  restoreDivision,
  restoreGame,
  restorePerson,
  restoreTeam,
  restoreVenue,
  listBinPart,
} from '@srleagues/core';
import { refresh } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { noticeHolderOf, savedNoticesHere } from '../../server/saved-notice.ts';
import { requestKeyOf, sameRequestsHere } from '../../server/same-request.ts';
import { binKindsShown, type BinKindShown } from './bin-view.ts';
import { binBackSaid, binNotSaid, binTitle } from './bin-answer.ts';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { fieldsOf, sameAddress } from '../teams-area/run-teams-action.ts';

type Outcome =
  | {
      readonly ok: true;
      readonly said: string;
      readonly about?: readonly string[];
      readonly name?: string;
    }
  | { readonly ok: false; readonly said: string; readonly name?: string };

/** The answers to the restores of the last ten minutes, by request (server/same-request.ts). */
const requests = () => sameRequestsHere<Outcome>();

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const binKinds = new Set<string>(binKindsShown);

export async function bringBackAction(form: FormData): Promise<void> {
  const fields = fieldsOf(form);
  const view = await loadLeaguePage(fields['league'] ?? '', 'admin');
  const context = commandContextOf(view.context);
  // The bin's commands on the bin's own store: the port People's "Put them back" runs on.
  const deps = (await webPorts()).adminPeople.putBack;
  const bin = leagueUrl(view.context.league, 'admin-area', { area: 'settings', subpath: ['bin'] });
  const id = (fields['id'] ?? '').trim().toLowerCase();
  const kind = fields['kind'];
  if (!uuidShape.test(id)) return redirect(bin);
  const restore = async () =>
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
  if (!binKinds.has(kind ?? '')) return redirect(bin);
  const outcome = await requests().once(
    requestKeyOf(context, fields),
    async (): Promise<Outcome> => {
      // Its name as the bin lists it, read before it leaves the bin, so the answer (and the
      // same answer to a second post, when it is no longer there) can name it.
      const listed = await listBinPart(context, {}, deps);
      const item = listed.ok ? listed.value.items.find((i) => i.id === id) : undefined;
      const named = item === undefined ? {} : { name: binTitle(item) };
      const result = await restore();
      if (result === undefined) return { ok: false, said: '' };
      if (!result.done.ok) {
        return { ok: false, said: binNotSaid(result.name, result.done.error.code), ...named };
      }
      // A game brought back is a schedule change (A-19): its revision, the teams and people
      // it reaches (A-7) and the games now at its time, kept on the server for the next page.
      const game = 'revision' in result.done.value ? result.done.value : undefined;
      if (game !== undefined && game.revision !== null) {
        return {
          ok: true,
          said: binBackSaid('game', {
            game: { revision: game.revision, teams: game.teamCount, people: game.peopleCount },
            seasonId: game.seasonId,
          }),
          about: game.clashes.map((c) => c.id),
          ...named,
        };
      }
      // A person back who is the league's first recorded child put "children in full" back to no (S-109).
      const firstChild =
        'clearedChildrenInFull' in result.done.value &&
        result.done.value.clearedChildrenInFull === true;
      return {
        ok: true,
        said: binBackSaid(kind === 'person' ? 'person' : (kind as BinKindShown), { firstChild }),
        ...named,
      };
    },
    // A kept "brought back" is the truth only while the thing is out of the bin: a stale tap
    // (an old bin page, after it was binned again) brings it back again rather than saying so.
    async (kept) => {
      if (!kept.ok) return true;
      const now = await listBinPart(context, {}, deps);
      return now.ok && !now.value.items.some((i) => i.id === id);
    },
  );
  if (outcome.said === '') return redirect(bin);
  const holder = noticeHolderOf(context);
  if (holder !== undefined) {
    savedNoticesHere().leave(holder, {
      screen: 'bin',
      thing: id,
      said: outcome.said,
      ...(outcome.name === undefined ? {} : { name: outcome.name }),
      ...(outcome.ok && outcome.about !== undefined && outcome.about.length > 0
        ? { about: outcome.about }
        : {}),
    });
  }
  const asked = await headers();
  // A refusal goes back to the bin at its row (#bin-…): with the page's own scripts (Next.js's
  // header) that is a mere scroll, and the row's answer would not be drawn. A post from the
  // bin itself is drawn again in place instead, as Teams does; with no script it redirects.
  if (asked.has('next-action') && sameAddress(asked.get('referer'), bin)) {
    refresh();
    return;
  }
  redirect(outcome.ok ? bin : `${bin}#bin-${id}`);
}
