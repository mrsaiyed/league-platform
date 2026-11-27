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
  getPerson,
  leagueUrl,
  listBinPart,
  listPeople,
  removePerson,
  restorePerson,
  setNameRequest,
  updatePerson,
  type CommandContext,
} from '@srleagues/core';
import { refresh } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import { requestKeyOf, sameRequestsHere } from '../../server/same-request.ts';
import { noticeHolderOf, savedNoticesHere, type NoticeScreen } from '../../server/saved-notice.ts';
import {
  typedOf,
  untouched,
  type FormState,
  type Refused,
  type TypedFields,
} from '../list-forms/form-state.ts';
import { rosterName } from '../teams-area/index.ts';
import { unlikelyYears } from './age-on-record.ts';
import { wholeNameInFirst } from './whole-name.ts';
import { peopleRefusalText } from './refusal-text.ts';
import { detailsAnchor, showAsAnchor } from './anchors.ts';
import { nameRequestInputOf, nameRequestRefusalCode } from './name-request.ts';
import {
  newPersonInput,
  onlyMadeUpEmailCode,
  personChangeInput,
  sameNameKey,
  wrongBoxes,
  type PersonBox,
} from './person-input.ts';
import { currentTeamsByPerson } from './teams-of-people.ts';
import { emailNotTakenHere } from './test-copy-email.ts';

type Outcome =
  | { readonly ok: true; readonly personId: string; readonly firstChild?: boolean }
  | { readonly ok: false; readonly code: string };

/** The answers to the saves of the last ten minutes, by request (server/same-request.ts). */
const requests = () => sameRequestsHere<Outcome>();

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The People area of the league the form came from, checked by the gate. */
async function peopleOf(fields: TypedFields) {
  const view = await loadLeaguePage(fields['league'] ?? '', 'admin', 'people');
  const league = view.context.league;
  const context: CommandContext = commandContextOf(view.context);
  const { adminPeople, publicSchedule, testCopy } = await webPorts();
  return {
    context,
    /** The league's state: an archived one takes only a change that shows less (R-26). */
    leagueStatus: league.status,
    /** The test copy takes only a made-up contact email (step 2.205): from the ports. */
    testCopy,
    deps: adminPeople.deps,
    putBack: adminPeople.putBack,
    /** The league's own today, from the ports' one clock (the age a date makes is on it). */
    leagueToday: async () => (await publicSchedule.clockOf(league.id)).today,
    list: leagueUrl(league, 'admin-area', { area: 'people' }),
    searched: (name: string) =>
      leagueUrl(league, 'admin-area', { area: 'people', query: { q: name } }),
    record: (personId: string) =>
      leagueUrl(league, 'admin-area', { area: 'people', subpath: [personId] }),
  };
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
  name?: string,
): Refused {
  if (code === 'changed-since-read') refresh();
  return { kind: 'refused', code, typed, wrong, said: peopleRefusalText(command, code, name) };
}

/**
 * On the test copy, a contact email that is not made up (step 2.205, T-13, T-201): nothing
 * is saved, the email box says why and every box keeps what was typed.
 */
function onlyMadeUpEmail(typed: TypedFields): Refused {
  return {
    kind: 'refused',
    code: onlyMadeUpEmailCode,
    typed,
    wrong: ['contactEmail'],
    said: t('adminPeople.refused', { problem: t('problem.onlyMadeUpAddresses') }),
  };
}

function leaveNotice(
  context: CommandContext,
  screen: NoticeScreen,
  thing: string,
  said: string,
  name?: string,
) {
  const holder = noticeHolderOf(context);
  if (holder !== undefined) {
    savedNoticesHere().leave(holder, {
      screen,
      thing,
      said,
      ...(name === undefined ? {} : { name }),
    });
  }
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

/**
 * A whole name typed into the first-name box (step 2.146) is asked about before saving:
 * nothing is saved, the boxes keep what was typed, and a tick that holds the first name it
 * was given for saves it as it is. Undefined when there is nothing to ask.
 */
function askAboutWholeName(fields: TypedFields): Refused | undefined {
  const first = (fields['firstName'] ?? '').trim();
  if (fields['wholeNameChecked'] === first) return undefined;
  if (!wholeNameInFirst(first, fields['lastName'] ?? '')) return undefined;
  return {
    kind: 'refused',
    code: 'whole-name-check',
    typed: fields,
    wrong: [],
    said: t('adminPeople.wholeName.check', { first }),
  };
}

/**
 * A date of birth that makes a player very young or very old is shown back before it is
 * saved (R-28 as changed on 2026-11-17: a wrong year is the mistake that rule guards
 * against). Nothing is saved; the box keeps the date, the sentence says the age it makes,
 * and a tick under it lets the admin save it as it is. Undefined when there is nothing to ask.
 */
function askAboutBirthDate(
  fields: TypedFields,
  leagueToday: string,
  storedBirthDate?: string,
): Refused | undefined {
  const typed = (fields['birthDate'] ?? '').trim();
  // The tick holds the date it was given for: it never lets a different date through.
  if (typed === '' || typed === storedBirthDate || fields['birthDateChecked'] === typed) {
    return undefined;
  }
  const years = unlikelyYears(typed, leagueToday);
  if (years === undefined) return undefined;
  // A question, not a wrong box: nothing is marked invalid (the form draws it as one).
  return {
    kind: 'refused',
    code: 'birth-date-check',
    typed: fields,
    wrong: [],
    said: t.plural('adminPeople.birthDate.check', years),
  };
}

/**
 * Adding someone whose first and last name someone in the league already has (in any
 * capitals) is asked first, naming where the other is, so a second record is made only on
 * purpose (people of the same name are told apart by their teams). The tick holds the name
 * it was given for. Undefined when there is nothing to ask.
 */
async function askAboutSameName(
  context: CommandContext,
  deps: Awaited<ReturnType<typeof peopleOf>>['deps'],
  fields: TypedFields,
): Promise<Refused | undefined> {
  const key = sameNameKey(fields['firstName'], fields['lastName']);
  if (fields['sameNameChecked'] === key) return undefined;
  const found = await listPeople(context, { search: key, limit: 20, offset: 0 }, deps);
  if (!found.ok) return undefined;
  const same = found.value.filter((p) => sameNameKey(p.firstName, p.lastName) === key);
  const first = same[0];
  if (first === undefined) return undefined;
  const teams = await currentTeamsByPerson(context);
  const where = same.map((p) => {
    const held = teams.get(p.id) ?? [];
    return held.length === 0
      ? t('adminPeople.sameName.noTeam')
      : t('adminPeople.sameName.onTeams', { teams: held.map((team) => team.name).join(', ') });
  });
  return {
    kind: 'refused',
    code: 'same-name-check',
    typed: fields,
    wrong: [],
    said:
      same.length === 1
        ? t('adminPeople.sameName.one', { name: rosterName(first), where: where.join('') })
        : t('adminPeople.sameName.several', {
            number: String(same.length),
            name: rosterName(first),
            where: where.join('; '),
          }),
  };
}

/**
 * The list's search. It is posted, not put in the address, so what was typed is only put
 * in one once it is known to be a name: an email address (never searched, and never to
 * ride in an address) sends the browser to the list's clean address, which then says so
 * under the box, once.
 */
export async function searchPeopleAction(form: FormData): Promise<void> {
  const fields = typedOf(form);
  const { context, list, searched } = await peopleOf(fields);
  // A curly apostrophe (as a phone types "o’neill") is a plain one, as core's search reads it.
  const typed = (fields['q'] ?? '')
    .trim()
    .slice(0, 100)
    .replace(/[\u2018\u2019]/g, "'");
  if (typed.includes('@')) {
    leaveNotice(context, 'people', '', 'email-not-searched');
    redirect(list);
  }
  redirect(typed === '' ? list : searched(typed));
}

/** "Add a person": saved, the browser goes to their own new page, which says so. */
export async function addPersonAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { context, deps, record, leagueToday, testCopy } = await peopleOf(fields);
  const today = await leagueToday();
  const wrong = wrongBoxes(fields, today);
  if (wrong.length > 0) return refused('create_person', 'invalid-input', fields, wrong);
  if (emailNotTakenHere(fields, testCopy)) return onlyMadeUpEmail(fields);
  const ask =
    askAboutWholeName(fields) ??
    askAboutBirthDate(fields, today) ??
    (await askAboutSameName(context, deps, fields));
  if (ask !== undefined) return ask;
  const result = await requests().once(requestKeyOf(context, fields), async () => {
    const made = await createPerson(context, newPersonInput(fields), deps);
    return made.ok
      ? {
          ok: true,
          personId: made.value.personId,
          firstChild: made.value.clearedChildrenInFull === true,
        }
      : { ok: false, code: made.error.code };
  });
  if (!result.ok) return refused('create_person', result.code, fields, []);
  // S-109: the adult league's first child put its "children in full" back to no.
  leaveNotice(context, 'person', result.personId, result.firstChild ? 'added.firstChild' : 'added');
  return redirect(`${record(result.personId)}#${detailsAnchor}`);
}

/** "Save details" on a person's page: saved, the page says so beside the details. */
export async function savePersonAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { context, deps, list, record, leagueToday, testCopy } = await peopleOf(fields);
  const personId = (fields['personId'] ?? '').trim().toLowerCase();
  const today = await leagueToday();
  const wrong = wrongBoxes(fields, today);
  if (wrong.length > 0) return refused('update_person', 'invalid-input', fields, wrong);
  if (emailNotTakenHere(fields, testCopy)) return onlyMadeUpEmail(fields);
  const wholeName = askAboutWholeName(fields);
  if (wholeName !== undefined) return wholeName;
  // Asked only about a date that is changed: one already saved is not asked about again.
  const typedDate = (fields['birthDate'] ?? '').trim();
  if (typedDate !== '' && fields['birthDateChecked'] !== typedDate) {
    const stored = await getPerson(context, { personId }, deps);
    const ask = askAboutBirthDate(
      fields,
      today,
      stored.ok ? (stored.value.sensitive?.birthDate ?? undefined) : undefined,
    );
    if (ask !== undefined) return ask;
  }
  const result = await requests().once(requestKeyOf(context, fields), async () => {
    const saved = await updatePerson(context, personChangeInput(fields), deps);
    return saved.ok
      ? { ok: true, personId, firstChild: saved.value.clearedChildrenInFull === true }
      : { ok: false, code: saved.error.code };
  });
  if (!result.ok) return refused('update_person', result.code, fields, []);
  if (!uuidShape.test(personId)) return redirect(list);
  leaveNotice(context, 'person', personId, result.firstChild ? 'saved.firstChild' : 'saved');
  await showSaved(`${record(personId)}#${detailsAnchor}`);
  return untouched;
}

/**
 * "Save Show as" on a person's page (R-23): the person's request about their name on
 * public pages, with the reason from the fixed list. The command checks people.manage and
 * the league's state again; a refusal in an archived league says why (R-26). Saved, the
 * page says so beside the form.
 */
export async function setNameRequestAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { context, deps, list, record, leagueStatus } = await peopleOf(fields);
  const input = nameRequestInputOf(fields);
  if (input === undefined || !uuidShape.test(input.personId)) {
    return refused('set_name_request', 'invalid-input', fields, []);
  }
  const result = await requests().once(requestKeyOf(context, fields), async () => {
    const saved = await setNameRequest(context, input, deps);
    return saved.ok
      ? { ok: true, personId: input.personId }
      : { ok: false, code: nameRequestRefusalCode(saved.error.code, leagueStatus) };
  });
  if (!result.ok) return refused('set_name_request', result.code, fields, []);
  if (!uuidShape.test(result.personId)) return redirect(list);
  leaveNotice(context, 'person', result.personId, 'showAsSaved');
  await showSaved(`${record(result.personId)}#${showAsAnchor}`);
  return untouched;
}

/** "Remove from the league list": done, the list says so; refused, said beside the button. */
export async function removePersonAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { context, deps, list } = await peopleOf(fields);
  const personId = (fields['personId'] ?? '').trim().toLowerCase();
  // Their name as it is stored, read before they go to the bin, so the answer can name them.
  const before = uuidShape.test(personId)
    ? await getPerson(context, { personId }, deps)
    : undefined;
  const name = before?.ok === true ? rosterName(before.value) : undefined;
  if (fields['confirm'] !== 'on') {
    return refused('remove_person', 'not-confirmed', fields, [], name);
  }
  const result = await requests().once(requestKeyOf(context, fields), async () => {
    const removed = await removePerson(context, { personId }, deps);
    return removed.ok ? { ok: true, personId } : { ok: false, code: removed.error.code };
  });
  if (!result.ok) return refused('remove_person', result.code, fields, [], name);
  leaveNotice(context, 'people', personId, 'removed', name);
  return redirect(list);
}

/**
 * "Put them back", in the notice that says someone was removed (A-5: one wrong tap has
 * its way back): the bin's own `leagues.restore_person`, which checks people.manage again.
 * They come back as they were, on no team (they could only be removed while on none), and
 * the browser goes to their record, which says so. Refused, the list says why, once.
 */
export async function putBackPersonAction(form: FormData): Promise<void> {
  const fields = typedOf(form);
  const { context, putBack, list, record } = await peopleOf(fields);
  const personId = (fields['personId'] ?? '').trim().toLowerCase();
  if (!uuidShape.test(personId)) redirect(list);
  const result = await requests().once(requestKeyOf(context, fields), async () => {
    const restored = await restorePerson(context, { personId }, putBack);
    return restored.ok ? { ok: true, personId } : { ok: false, code: restored.error.code };
  });
  if (!result.ok) {
    // Named as the bin lists them, read from the store (never the form), when it still does.
    const binned = await listBinPart(context, {}, putBack);
    const item = binned.ok ? binned.value.items.find((i) => i.id === personId) : undefined;
    leaveNotice(context, 'people', personId, `notPutBack.${result.code}`, item?.name || undefined);
    redirect(list);
  }
  leaveNotice(context, 'person', personId, 'putBack');
  redirect(`${record(personId)}#${detailsAnchor}`);
}
