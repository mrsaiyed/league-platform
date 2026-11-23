'use server';
// The scorekeepers forms' server actions (step 2.56). Who is asking and in which league come
// from the session and the address (loadLeaguePage, the Games area), never from the form;
// the form only says which game and which person. Each runs the games module's own command
// (assignScorekeeper, unassignScorekeeper), which logs it, once per request
// (server/same-request.ts), and is answered as record 067 says (../list-forms): refused in
// the response to the post with the choice kept and the box marked, or saved with a
// one-time notice said beside the game.
import {
  assignScorekeeper,
  unassignScorekeeper,
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
import { scorekeeperProblemKey, wrongScorekeeperFields } from './scorekeeper-answers.ts';
import { gameAnchor, scorekeepersAddress } from './scorekeepers-address.ts';

type Outcome = Result<unknown, { readonly code: string }>;
const requests = () => sameRequestsHere<Outcome>();
const text = (fields: TypedFields, name: string) => (fields[name] ?? '').trim();

async function answer(
  fields: TypedFields,
  said: 'assigned' | 'removed',
  accountId: string,
  run: (context: CommandContext) => Promise<Outcome>,
): Promise<FormState> {
  const view = await loadLeaguePage(fields['league'] ?? '', 'admin', 'games');
  const context = commandContextOf(view.context);
  const slug = text(fields, 'seasonSlug');
  const page = scorekeepersAddress(view.context.league, slug === '' ? undefined : slug);
  const outcome = await requests().once(requestKeyOf(context, fields), () => run(context));
  if (!outcome.ok) {
    const code = outcome.error.code;
    return refusedWith(code, fields, wrongScorekeeperFields(code), t(scorekeeperProblemKey(code)));
  }
  const ports = await webPorts();
  // The name as stored, read now, never from the form.
  const names = await ports.games.namesOf(view.context.league.id);
  const gameId = text(fields, 'game');
  return answerSaved(
    context,
    {
      screen: 'scorekeepers',
      thing: gameId,
      said,
      about: [accountId],
      name: names.people[accountId] ?? '',
    },
    `${page}#${gameAnchor(gameId)}`,
  );
}

export async function assignScorekeeperAction(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const fields = typedOf(form);
  const accountId = text(fields, 'person');
  const { deps } = (await webPorts()).games;
  return answer(fields, 'assigned', accountId, async (context) => {
    if (accountId === '') return { ok: false, error: { code: 'person-missing' } };
    return assignScorekeeper(context, { gameId: text(fields, 'game'), accountId }, deps);
  });
}

export async function unassignScorekeeperAction(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const fields = typedOf(form);
  const accountId = text(fields, 'account');
  const { deps } = (await webPorts()).games;
  return answer(fields, 'removed', accountId, (context) =>
    unassignScorekeeper(context, { gameId: text(fields, 'game'), accountId }, deps),
  );
}
