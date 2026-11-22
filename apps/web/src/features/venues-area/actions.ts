'use server';
// The venues screen's server actions (step 2.49): one for each form. Who is asking and in
// which league come from the session and the address (loadLeaguePage, the Schedule area),
// never from the form; the form only says which venue or court and what to do. Each runs the
// scheduling module's own venue and court commands, once per request (a double tap is
// answered as the first, server/same-request.ts), and is answered as record 067 says
// (../list-forms): refused in the response to the post with what was typed, or saved with a
// one-time notice beside the venue or court.
import {
  createCourt,
  createVenue,
  listVenues,
  removeCourt,
  removeVenue,
  restoreCourt,
  restoreVenue,
  updateCourt,
  updateVenue,
  type CommandContext,
  type Result,
} from '@srleagues/core';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import { requestKeyOf, sameRequestsHere } from '../../server/same-request.ts';
import {
  answerSaved,
  refusedWith,
  typedOf,
  type FormState,
  type TypedFields,
} from '../list-forms/index.ts';
import { venueProblemKey, wrongVenueFields, type VenueForm } from './venue-answers.ts';
import { courtAnchor, venueAnchor, venuesAddress, venuesListAnchor } from './venues-address.ts';

type Outcome = Result<unknown, { readonly code: string }> & { readonly name?: string };
const requests = () => sameRequestsHere<Outcome>();

const text = (fields: TypedFields, name: string) => (fields[name] ?? '').trim();
const given = (fields: TypedFields, name: string) => text(fields, name) || undefined;

/** The Schedule area of the league the form came from, checked by the gate. */
async function venuesOf(fields: TypedFields) {
  const view = await loadLeaguePage(fields['league'] ?? '', 'admin', 'schedule');
  const context: CommandContext = commandContextOf(view.context);
  return {
    context,
    deps: (await webPorts()).scheduleAdmin.deps,
    page: venuesAddress(view.context.league),
  };
}

type Saved = { readonly thing: string; readonly said: string; readonly at: string };

async function answer(
  fields: TypedFields,
  form: VenueForm,
  run: (context: CommandContext) => Promise<Outcome>,
  saved: (value: unknown) => Saved,
  putBack = false,
): Promise<FormState> {
  const { context, page } = await venuesOf(fields);
  const outcome = await requests().once(requestKeyOf(context, fields), () => run(context));
  if (!outcome.ok) {
    const code = outcome.error.code;
    return refusedWith(
      code,
      fields,
      wrongVenueFields(code, form, fields),
      t(venueProblemKey(code, form, fields, putBack)),
    );
  }
  const { thing, said, at } = saved(outcome.value);
  return answerSaved(
    context,
    {
      screen: 'venues',
      thing,
      said,
      ...(outcome.name === undefined ? {} : { name: outcome.name }),
    },
    `${page}#${at}`,
  );
}

const refuse = (code: string): Outcome => ({ ok: false, error: { code } });

export async function createVenueAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { deps } = await venuesOf(fields);
  return answer(
    fields,
    'venue',
    (context) => {
      const address = given(fields, 'address');
      const mapLink = given(fields, 'mapLink');
      return createVenue(
        context,
        {
          name: text(fields, 'name'),
          ...(address === undefined ? {} : { address }),
          ...(mapLink === undefined ? {} : { mapLink }),
        },
        deps,
      );
    },
    (value) => {
      const id = (value as { venueId: string }).venueId;
      return { thing: id, said: 'created', at: venueAnchor(id) };
    },
  );
}

export async function saveVenueAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { deps } = await venuesOf(fields);
  const venueId = text(fields, 'venue');
  return answer(
    fields,
    'venue',
    (context) =>
      updateVenue(
        context,
        {
          venueId,
          version: Number(text(fields, 'version')),
          name: text(fields, 'name'),
          // Left empty clears it.
          address: given(fields, 'address') ?? null,
          mapLink: given(fields, 'mapLink') ?? null,
        },
        deps,
      ),
    () => ({ thing: venueId, said: 'saved', at: venueAnchor(venueId) }),
  );
}

/** To the bin, after the tick (A-5); refused while it has courts or games to come. */
export async function removeVenueAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { deps } = await venuesOf(fields);
  const venueId = text(fields, 'venue');
  return answer(
    fields,
    'other',
    async (context) => {
      if (fields['confirm'] !== 'yes') return refuse('not-confirmed');
      // Its name as stored, read before it goes: the answer names what was removed.
      const listed = await listVenues(context, {}, deps);
      const name = listed.ok ? listed.value.find((v) => v.id === venueId)?.name : undefined;
      const result = await removeVenue(context, { venueId }, deps);
      return name === undefined ? result : { ...result, name };
    },
    () => ({ thing: venueId, said: 'removed', at: venuesListAnchor }),
  );
}

export async function restoreVenueAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { deps } = await venuesOf(fields);
  const venueId = text(fields, 'venue');
  return answer(
    fields,
    'other',
    (context) => restoreVenue(context, { venueId }, deps),
    () => ({ thing: venueId, said: 'restored', at: venueAnchor(venueId) }),
    true,
  );
}

export async function createCourtAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { deps } = await venuesOf(fields);
  const venueId = text(fields, 'venue');
  return answer(
    fields,
    'court',
    (context) => createCourt(context, { venueId, name: text(fields, 'name') }, deps),
    (value) => {
      const id = (value as { courtId: string }).courtId;
      return { thing: id, said: 'courtCreated', at: courtAnchor(id) };
    },
  );
}

export async function saveCourtAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { deps } = await venuesOf(fields);
  const courtId = text(fields, 'court');
  return answer(
    fields,
    'court',
    (context) =>
      updateCourt(
        context,
        { courtId, version: Number(text(fields, 'version')), name: text(fields, 'name') },
        deps,
      ),
    () => ({ thing: courtId, said: 'courtSaved', at: courtAnchor(courtId) }),
  );
}

/**
 * One place up or down among its venue's courts: every court of the venue is given its
 * place in the new order (a display order, where the last save wins, so no version).
 */
export async function moveCourtAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { deps } = await venuesOf(fields);
  const courtId = text(fields, 'court');
  const venueId = text(fields, 'venue');
  const down = fields['direction'] === 'down';
  return answer(
    fields,
    'other',
    async (context) => {
      const listed = await listVenues(context, {}, deps);
      if (!listed.ok) return listed;
      const courts = listed.value.find((v) => v.id === venueId)?.courts ?? [];
      const at = courts.findIndex((c) => c.id === courtId);
      if (at === -1) return refuse('court-not-found');
      const to = down ? at + 1 : at - 1;
      if (to < 0 || to >= courts.length) return { ok: true, value: undefined };
      const order = [...courts];
      const [moved] = order.splice(at, 1);
      if (moved !== undefined) order.splice(to, 0, moved);
      for (const [place, court] of order.entries()) {
        if (court.sort === place) continue;
        const result = await updateCourt(context, { courtId: court.id, sort: place }, deps);
        if (!result.ok) return result;
      }
      return { ok: true, value: undefined };
    },
    () => ({ thing: courtId, said: 'courtMoved', at: courtAnchor(courtId) }),
  );
}

/** To the bin, after the tick (A-5); refused while games are still to come on it. */
export async function removeCourtAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { deps } = await venuesOf(fields);
  const courtId = text(fields, 'court');
  const venueId = text(fields, 'venue');
  return answer(
    fields,
    'other',
    async (context) => {
      if (fields['confirm'] !== 'yes') return refuse('not-confirmed');
      const listed = await listVenues(context, {}, deps);
      const name = listed.ok
        ? listed.value.flatMap((v) => v.courts).find((c) => c.id === courtId)?.name
        : undefined;
      const result = await removeCourt(context, { courtId }, deps);
      return name === undefined ? result : { ...result, name };
    },
    // Said in its venue's panel, which still holds the way back to the court.
    () => ({ thing: `${venueId}/${courtId}`, said: 'courtRemoved', at: venueAnchor(venueId) }),
  );
}

export async function restoreCourtAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { deps } = await venuesOf(fields);
  const courtId = text(fields, 'court');
  return answer(
    fields,
    'other',
    (context) => restoreCourt(context, { courtId }, deps),
    () => ({ thing: courtId, said: 'courtRestored', at: courtAnchor(courtId) }),
    true,
  );
}
