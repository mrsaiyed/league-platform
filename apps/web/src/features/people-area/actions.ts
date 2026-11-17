'use server';
// Admin → People's server actions (step 2.50): add a person, fix their details, take them
// off the league list. Who is asking and which league come from the session and the
// address (loadLeaguePage refuses anyone the People area is not open to), never from the
// form; the form only says which person and what was typed. Every change runs as a people
// command, which checks the permission again and decides who may set a contact email, a
// birth date or whether someone is a child (R-16, T-74).
//
// How a form is answered (T-271, record 067), as in the games area: nothing of it rides in
// the address, so a person's name, email or birth date never ends up in one.
// - refused: in the response to the post itself, drawn from what was posted, so every box
//   still holds what was typed and the wrong one is marked beside it;
// - saved: a one-time notice that names only the screen, the person's id and what was
//   done (server/saved-notice.ts); the screen says "Saved" beside the details, naming the
//   person as they are now, once. With scripts off the browser is sent to the screen; with
//   scripts on a save on the person's own page draws that page again in the answer;
// - sent twice (a double tap): known by the form's one-time token and what it held, and
//   answered as the first (server/same-request.ts), so nobody is added twice.
import {
  createPerson,
  leagueUrl,
  removePerson,
  updatePerson,
  type CommandContext,
} from '@srleagues/core';
import { catalogs } from '@srleagues/site';
import { refresh } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t, type TextKey } from '../../server/messages.ts';
import { requestKeyOf, sameRequestsHere } from '../../server/same-request.ts';
import { noticeHolderOf, savedNoticesHere, type NoticeScreen } from '../../server/saved-notice.ts';
import {
  typedOf,
  untouched,
  type FormState,
  type Refused,
  type TypedFields,
} from '../games-area/form-state.ts';
import { detailsAnchor } from './anchors.ts';
import { newPersonInput, personChangeInput, wrongBoxes, type PersonBox } from './person-input.ts';

type Outcome =
  | { readonly ok: true; readonly personId: string }
  | { readonly ok: false; readonly code: string };

/** The answers to the saves of the last ten minutes, by request (server/same-request.ts). */
const requests = () => sameRequestsHere<Outcome>();

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The People area of the league the form came from, checked by the gate. */
async function peopleOf(fields: TypedFields) {
  const view = await loadLeaguePage(fields['league'] ?? '', 'admin', 'people');
  const league = view.context.league;
  const context: CommandContext = commandContextOf(view.context);
  const { adminPeople } = await webPorts();
  return {
    context,
    deps: adminPeople.deps,
    list: leagueUrl(league, 'admin-area', { area: 'people' }),
    record: (personId: string) =>
      leagueUrl(league, 'admin-area', { area: 'people', subpath: [personId] }),
  };
}

/** The sentence for a refusal: the command's own when the message file has one. */
function problemText(command: string, code: string): string {
  const english = catalogs['en'] ?? {};
  for (const key of [`error.people.${command}.${code}`, `error.${code}`]) {
    if (Object.hasOwn(english, key))
      return t('adminPeople.refused', { problem: t(key as TextKey) });
  }
  return t('adminPeople.refused', { problem: t('error.unknown') });
}

/**
 * A refusal, drawn from the post. When the person may have changed meanwhile, the page is
 * drawn again as it is now (A-8: the latest is shown), keeping what was typed.
 */
function refused(
  command: string,
  code: string,
  typed: TypedFields,
  wrong: readonly PersonBox[],
): Refused {
  if (code === 'changed-since-read') refresh();
  return { kind: 'refused', code, typed, wrong, said: problemText(command, code) };
}

function leaveNotice(context: CommandContext, screen: NoticeScreen, thing: string, said: string) {
  const holder = noticeHolderOf(context);
  if (holder !== undefined) savedNoticesHere().leave(holder, { screen, thing, said });
}

/** Back on the form's own page, drawn again in the answer with scripts on; else sent there. */
async function showSaved(to: string): Promise<void> {
  // Next.js's own header on a post its scripts send; a form sent by the browser has none.
  if ((await headers()).has('next-action')) {
    refresh();
    return;
  }
  redirect(to);
}

/** "Add a person": saved, the browser goes to their own new page, which says so. */
export async function addPersonAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { context, deps, record } = await peopleOf(fields);
  const wrong = wrongBoxes(fields);
  if (wrong.length > 0) return refused('create_person', 'invalid-input', fields, wrong);
  const result = await requests().once(requestKeyOf(context, fields), async () => {
    const made = await createPerson(context, newPersonInput(fields), deps);
    return made.ok
      ? { ok: true, personId: made.value.personId }
      : { ok: false, code: made.error.code };
  });
  if (!result.ok) return refused('create_person', result.code, fields, []);
  leaveNotice(context, 'person', result.personId, 'added');
  return redirect(`${record(result.personId)}#${detailsAnchor}`);
}

/** "Save details" on a person's page: saved, the page says so beside the details. */
export async function savePersonAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { context, deps, list, record } = await peopleOf(fields);
  const personId = (fields['personId'] ?? '').trim().toLowerCase();
  const wrong = wrongBoxes(fields);
  if (wrong.length > 0) return refused('update_person', 'invalid-input', fields, wrong);
  const result = await requests().once(requestKeyOf(context, fields), async () => {
    const saved = await updatePerson(context, personChangeInput(fields), deps);
    return saved.ok ? { ok: true, personId } : { ok: false, code: saved.error.code };
  });
  if (!result.ok) return refused('update_person', result.code, fields, []);
  if (!uuidShape.test(personId)) return redirect(list);
  leaveNotice(context, 'person', personId, 'saved');
  await showSaved(`${record(personId)}#${detailsAnchor}`);
  return untouched;
}

/** "Remove from the league list": done, the list says so; refused, said beside the button. */
export async function removePersonAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { context, deps, list } = await peopleOf(fields);
  if (fields['confirm'] !== 'on') return refused('remove_person', 'not-confirmed', fields, []);
  const personId = (fields['personId'] ?? '').trim().toLowerCase();
  const result = await requests().once(requestKeyOf(context, fields), async () => {
    const removed = await removePerson(context, { personId }, deps);
    return removed.ok ? { ok: true, personId } : { ok: false, code: removed.error.code };
  });
  if (!result.ok) return refused('remove_person', result.code, fields, []);
  leaveNotice(context, 'people', personId, 'removed');
  return redirect(list);
}
