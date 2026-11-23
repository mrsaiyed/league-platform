'use server';
// The adjustments forms' server actions (step 2.56). Who is asking and in which league come
// from the session and the address (loadLeaguePage, the Standings and stats area), never
// from the form; the form only says which season, team or adjustment and what to do. Each
// runs the standings module's own command, once per request (server/same-request.ts), and
// is answered as record 067 says (../list-forms): refused in the response to the post with
// what was typed and the wrong box marked, or saved with a one-time notice in the list.
import {
  addAdjustment,
  awardGame,
  listAdjustments,
  overturnResult,
  recordCoinFlip,
  removeAdjustment,
  removeCoinFlip,
  type CommandContext,
  type Result,
} from '@srleagues/core';
import { randomInt } from 'node:crypto';
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
import {
  adjustmentLimitWords,
  adjustmentProblemKey,
  readCounts,
  reasonProblem,
  wrongAdjustmentFields,
} from './adjustment-answers.ts';
import { adjustmentWhat, gameName } from './adjustment-text.ts';
import {
  adjustmentsListAnchor,
  coinFlipsAnchor,
  standingsAreaAddress,
} from './standings-address.ts';

type Outcome = Result<unknown, { readonly code: string }> & {
  readonly name?: string;
  readonly box?: string;
};
const requests = () => sameRequestsHere<Outcome>();
const text = (fields: TypedFields, name: string) => (fields[name] ?? '').trim();
const refuse = (code: string, box?: string): Outcome => ({
  ok: false,
  error: { code },
  ...(box === undefined ? {} : { box }),
});

/** The Standings and stats area of the league the form came from, checked by the gate. */
async function standingsOf(fields: TypedFields) {
  const view = await loadLeaguePage(fields['league'] ?? '', 'admin', 'standings');
  const ports = await webPorts();
  const slug = text(fields, 'seasonSlug');
  return {
    context: commandContextOf(view.context),
    leagueId: view.context.league.id,
    deps: ports.games.standingsDeps,
    teamsOf: ports.scheduleAdmin.teamsOf,
    page: standingsAreaAddress(view.context.league, slug === '' ? undefined : slug),
  };
}

async function answer(
  fields: TypedFields,
  said: 'added' | 'removed' | 'flip-saved' | 'flip-removed',
  run: (context: CommandContext) => Promise<Outcome>,
  anchor: string = adjustmentsListAnchor,
): Promise<FormState> {
  const { context, page } = await standingsOf(fields);
  const outcome = await requests().once(requestKeyOf(context, fields), () => run(context));
  if (!outcome.ok) {
    const code = outcome.error.code;
    return refusedWith(
      code,
      fields,
      wrongAdjustmentFields(code, outcome.box),
      code === 'number-too-big'
        ? t(adjustmentProblemKey(code), adjustmentLimitWords)
        : t(adjustmentProblemKey(code)),
    );
  }
  return answerSaved(
    context,
    {
      screen: 'standings',
      thing: text(fields, 'season'),
      said,
      ...(outcome.name === undefined ? {} : { name: outcome.name }),
    },
    `${page}#${anchor}`,
  );
}

/** The level teams a coin-flip form is about, as its hidden field lists them. */
const teamsField = (fields: TypedFields) =>
  text(fields, 'teams')
    .split(',')
    .filter((id) => id !== '');

/** The teams' names, in this order, for the answer. */
async function namesOf(fields: TypedFields, teamIds: readonly string[]): Promise<string> {
  const { leagueId, teamsOf } = await standingsOf(fields);
  const teams = await teamsOf(leagueId, text(fields, 'season'));
  return teamIds.map((id) => teams.find((x) => x.id === id)?.name ?? '').join(', ');
}

/** A fair order, drawn here on the server (S-89): every order of the teams as likely. */
function drawn(teamIds: readonly string[]): string[] {
  const order = [...teamIds];
  for (let i = order.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [order[i], order[j]] = [order[j] ?? '', order[i] ?? ''];
  }
  return order;
}

/**
 * Records a coin flip for teams level after every tiebreaker: the order chosen place by
 * place (flipped at the table), or, with `method=drawn` ("Flip for us"), drawn here.
 */
export async function recordCoinFlipAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { deps } = await standingsOf(fields);
  const seasonId = text(fields, 'season');
  const level = teamsField(fields);
  const byHand = text(fields, 'method') !== 'drawn';
  return answer(
    fields,
    'flip-saved',
    async (context) => {
      const placed = byHand ? level.map((_, i) => text(fields, `place${i + 1}`)) : drawn(level);
      if (new Set(placed).size !== placed.length || !placed.every((id) => level.includes(id))) {
        return refuse('place-twice');
      }
      const note = text(fields, 'note');
      if (note.length > 500) return refuse('reason-too-long', 'note');
      const result = await recordCoinFlip(
        context,
        {
          seasonId,
          teamIds: placed,
          method: byHand ? 'by-hand' : 'drawn',
          ...(note === '' ? {} : { note }),
        },
        deps,
      );
      if (!result.ok) return result;
      return { ...result, name: await namesOf(fields, placed) };
    },
    coinFlipsAnchor,
  );
}

/** Takes a coin flip off, after the tick and with a reason kept in the activity log. */
export async function removeCoinFlipAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { deps } = await standingsOf(fields);
  const seasonId = text(fields, 'season');
  return answer(
    fields,
    'flip-removed',
    async (context) => {
      const reasonWrong = reasonProblem(fields['reason']);
      if (reasonWrong !== undefined) return refuse(reasonWrong, 'reason');
      if (fields['confirm'] !== 'yes') return refuse('not-confirmed');
      const result = await removeCoinFlip(
        context,
        { seasonId, flipId: text(fields, 'flip'), reason: text(fields, 'reason') },
        deps,
      );
      if (!result.ok) return result;
      return { ...result, name: await namesOf(fields, teamsField(fields)) };
    },
    coinFlipsAnchor,
  );
}

export async function addAdjustmentAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { deps, leagueId, teamsOf } = await standingsOf(fields);
  const seasonId = text(fields, 'season');
  return answer(fields, 'added', async (context) => {
    const teamId = text(fields, 'team');
    if (teamId === '') return refuse('team-not-found', 'team');
    const counts = readCounts(fields);
    if (!counts.ok) return refuse(counts.code, counts.box);
    const reasonWrong = reasonProblem(fields['reason']);
    if (reasonWrong !== undefined) return refuse(reasonWrong, 'reason');
    const result = await addAdjustment(
      context,
      { seasonId, teamId, ...counts.counts, reason: text(fields, 'reason') },
      deps,
    );
    if (!result.ok) return result;
    const team = (await teamsOf(leagueId, seasonId)).find((x) => x.id === teamId)?.name ?? '';
    return { ...result, name: adjustmentWhat(team, counts.counts) };
  });
}

/** Off the season, after the tick and with a reason kept in the activity log. */
export async function removeAdjustmentAction(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const fields = typedOf(form);
  const { deps, leagueId, teamsOf } = await standingsOf(fields);
  const seasonId = text(fields, 'season');
  const adjustmentId = text(fields, 'adjustment');
  return answer(fields, 'removed', async (context) => {
    const reasonWrong = reasonProblem(fields['reason']);
    if (reasonWrong !== undefined) return refuse(reasonWrong, 'reason');
    if (fields['confirm'] !== 'yes') return refuse('not-confirmed');
    // What it changed, read before it goes: the answer names what was taken off.
    const listed = await listAdjustments(context, { seasonId }, deps);
    const gone = listed.ok
      ? listed.value.adjustments.find((a) => a.id === adjustmentId)
      : undefined;
    const result = await removeAdjustment(
      context,
      { seasonId, adjustmentId, reason: text(fields, 'reason') },
      deps,
    );
    if (!result.ok || gone === undefined) return result;
    const team = (await teamsOf(leagueId, seasonId)).find((x) => x.id === gone.teamId)?.name ?? '';
    return { ...result, name: adjustmentWhat(team, gone) };
  });
}

/** "Overturn a result" (S-10, M6): one action, both teams' halves, one reason naming the game. */
export async function overturnResultAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { deps, leagueId, teamsOf } = await standingsOf(fields);
  const seasonId = text(fields, 'season');
  return answer(fields, 'added', async (context) => {
    const gameId = text(fields, 'game');
    const reasonWrong = reasonProblem(fields['reason']);
    if (reasonWrong !== undefined) return refuse(reasonWrong, 'reason');
    const listed = await listAdjustments(context, { seasonId }, deps);
    if (listed.ok && listed.value.adjustments.some((a) => a.gameId === gameId)) {
      // A second tap of the same overturn (S-85).
      return refuse('game-already-overturned', 'game');
    }
    const game = listed.ok ? listed.value.games.find((g) => g.gameId === gameId) : undefined;
    if (game === undefined) return refuse('game-not-found', 'game');
    const teams = await teamsOf(leagueId, seasonId);
    const named = gameName(game, (id) => teams.find((x) => x.id === id)?.name ?? '');
    // The footnote names the game it overturns, on both teams' rows.
    const reason = t('adminStandings.overturn.reasonText', {
      game: named,
      reason: text(fields, 'reason'),
    });
    // The game's name counts towards the reason's 500 characters.
    if (reasonProblem(reason) !== undefined) return refuse('reason-too-long', 'reason');
    const result = await overturnResult(context, { seasonId, gameId, reason }, deps);
    if (!result.ok) return result;
    return { ...result, name: t('adminStandings.overturn.what', { game: named }) };
  });
}

/** "Award a game not played" (S-85): a win for one team, a loss for the other, one reason. */
export async function awardGameAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { deps, leagueId, teamsOf } = await standingsOf(fields);
  const seasonId = text(fields, 'season');
  return answer(fields, 'added', async (context) => {
    const winnerTeamId = text(fields, 'winner');
    const loserTeamId = text(fields, 'loser');
    if (winnerTeamId === '') return refuse('team-not-found', 'winner');
    if (loserTeamId === '' || loserTeamId === winnerTeamId) return refuse('same-team', 'loser');
    const reasonWrong = reasonProblem(fields['reason']);
    if (reasonWrong !== undefined) return refuse(reasonWrong, 'reason');
    const result = await awardGame(
      context,
      { seasonId, winnerTeamId, loserTeamId, reason: text(fields, 'reason') },
      deps,
    );
    if (!result.ok) return result;
    const teams = await teamsOf(leagueId, seasonId);
    const nameOf = (id: string) => teams.find((x) => x.id === id)?.name ?? '';
    return {
      ...result,
      name: t('adminStandings.award.what', {
        winner: nameOf(winnerTeamId),
        loser: nameOf(loserTeamId),
      }),
    };
  });
}
