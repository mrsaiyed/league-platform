'use server';
// The divisions screen's server actions (step 2.49): one for each form. Who is asking and in
// which league come from the session and the address (loadLeaguePage), never from the form;
// the form only says which season or division and what to do. Each runs the product's own
// division command on the leagues module's transaction, once per request (a double tap is
// answered as the first, server/same-request.ts), and is answered as record 067 says
// (../list-forms): refused in the response to the post with what was typed, or saved with a
// one-time notice beside the division.
import {
  createDivision,
  listDivisions,
  removeDivision,
  reorderDivisions,
  restoreDivision,
  updateDivision,
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
import { divisionAnchor, divisionsAddress, divisionsListAnchor } from './divisions-address.ts';
import { divisionProblemKey, wrongDivisionFields } from './division-answers.ts';
import { movedOrder, siblingsOf, type Direction } from './division-order.ts';

type Outcome = Result<unknown, { readonly code: string }>;
const requests = () => sameRequestsHere<Outcome & { readonly name?: string }>();

const text = (fields: TypedFields, name: string) => (fields[name] ?? '').trim();

/** The season settings area of the league the form came from, checked by the gate. */
async function divisionsOf(fields: TypedFields) {
  const view = await loadLeaguePage(fields['league'] ?? '', 'admin', 'season');
  const context: CommandContext = commandContextOf(view.context);
  const page = divisionsAddress(view.context.league, fields['season']);
  return { context, deps: (await webPorts()).adminSettings.deps, page };
}

/** A color from the form: null when the league's own colors are ticked or none came. */
function colorOf(fields: TypedFields): string | null {
  return fields['useOwnColors'] !== undefined ? null : text(fields, 'color') || null;
}

/** The answer to a division form: saved beside the division, or refused with what was typed. */
async function answer(
  fields: TypedFields,
  run: (context: CommandContext) => Promise<Outcome & { readonly name?: string }>,
  saved: (value: unknown) => { readonly thing: string; readonly said: string; readonly at: string },
  putBack = false,
): Promise<FormState> {
  const { context, page } = await divisionsOf(fields);
  const outcome = await requests().once(requestKeyOf(context, fields), () => run(context));
  if (!outcome.ok) {
    const code = outcome.error.code;
    return refusedWith(
      code,
      fields,
      wrongDivisionFields(code),
      t(divisionProblemKey(code, putBack)),
    );
  }
  const { thing, said, at } = saved(outcome.value);
  return answerSaved(
    context,
    {
      screen: 'divisions',
      thing,
      said,
      ...(outcome.name === undefined ? {} : { name: outcome.name }),
    },
    `${page}#${at}`,
  );
}

export async function createDivisionAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { deps } = await divisionsOf(fields);
  return answer(
    fields,
    (context) => {
      const color = colorOf(fields);
      return createDivision(
        context,
        {
          seasonId: text(fields, 'seasonId'),
          name: text(fields, 'name'),
          ...(color === null ? {} : { color }),
        },
        deps,
      );
    },
    (value) => {
      const id = (value as { divisionId: string }).divisionId;
      return { thing: id, said: 'created', at: divisionAnchor(id) };
    },
  );
}

export async function saveDivisionAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { deps } = await divisionsOf(fields);
  const divisionId = text(fields, 'division');
  return answer(
    fields,
    (context) =>
      updateDivision(
        context,
        {
          divisionId,
          version: Number(text(fields, 'version')),
          name: text(fields, 'name'),
          color: colorOf(fields),
        },
        deps,
      ),
    () => ({ thing: divisionId, said: 'saved', at: divisionAnchor(divisionId) }),
  );
}

/** One place up or down among the divisions under the same parent. */
export async function moveDivisionAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { deps } = await divisionsOf(fields);
  const divisionId = text(fields, 'division');
  const seasonId = text(fields, 'seasonId');
  const direction: Direction = fields['direction'] === 'down' ? 'down' : 'up';
  return answer(
    fields,
    async (context) => {
      const listed = await listDivisions(context, { seasonId }, deps);
      if (!listed.ok) return listed;
      const division = listed.value.find((d) => d.id === divisionId);
      if (division === undefined) return { ok: false, error: { code: 'division-not-found' } };
      const order = movedOrder(siblingsOf(listed.value, division), divisionId, direction);
      // Already first (or last): nothing to move, and nothing went wrong.
      if (order === undefined) return { ok: true, value: undefined };
      return reorderDivisions(
        context,
        {
          seasonId,
          ...(division.parentDivisionId === null
            ? {}
            : { parentDivisionId: division.parentDivisionId }),
          divisionIds: [...order],
        },
        deps,
      );
    },
    () => ({ thing: divisionId, said: 'moved', at: divisionAnchor(divisionId) }),
  );
}

/** To the bin, after the tick that says the person is sure (A-5). */
export async function removeDivisionAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { deps } = await divisionsOf(fields);
  const divisionId = text(fields, 'division');
  const seasonId = text(fields, 'seasonId');
  return answer(
    fields,
    async (context) => {
      if (fields['confirm'] !== 'yes') return { ok: false, error: { code: 'not-confirmed' } };
      // Its name as stored, read before it goes: the answer names what was removed.
      const listed = await listDivisions(context, { seasonId }, deps);
      const name = listed.ok ? listed.value.find((d) => d.id === divisionId)?.name : undefined;
      const result = await removeDivision(context, { divisionId }, deps);
      return name === undefined ? result : { ...result, name };
    },
    () => ({ thing: divisionId, said: 'removed', at: divisionsListAnchor }),
  );
}

/** "Put it back", right after a removal (A-5). */
export async function restoreDivisionAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { deps } = await divisionsOf(fields);
  const divisionId = text(fields, 'division');
  return answer(
    fields,
    (context) => restoreDivision(context, { divisionId }, deps),
    () => ({ thing: divisionId, said: 'restored', at: divisionAnchor(divisionId) }),
    true,
  );
}
