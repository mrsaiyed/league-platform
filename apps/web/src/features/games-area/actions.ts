'use server';
// The games area's server actions. Who is asking and which league come from the session
// and the address (loadLeaguePage), never from the form; the form only says which game
// and what to do.
//
// How a form is answered (T-271, record 067; nothing of it rides in the address):
// - refused, or a question before a final score is saved: in the response to the post
//   itself, drawn from what was posted (form-state.ts), so every box still holds what was
//   typed and the wrong one is marked;
// - saved: a one-time notice that says only which game and what was done is left for the
//   screen (server/saved-notice.ts), and the screen is drawn again from what is saved,
//   saying "Saved" beside the game, naming it, once: a reload says nothing old. With
//   scripts off the browser is sent to the screen (post, redirect, get), to the game's
//   place on it. With scripts on the screen is drawn again in the answer to the post
//   (Next.js's refresh), where the person is looking: Next.js does not draw a page sent to
//   its own address again when only the place on it (#…) differs, so a redirect there
//   would show nothing (showSaved);
// - sent twice (a double tap, the browser sending it again): known by the form's one-time
//   token and what it held, and answered as the first (server/same-request.ts).
//
// A final score takes two steps of its own on the server (A-5): the score boxes' form
// only asks (it changes nothing), and only the question's own form, which says it was
// confirmed, saves it. So a double tap, or going back and sending the boxes again, only
// asks again.
import { leagueUrl, type CommandContext } from '@srleagues/core';
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
  sheetScoresId,
  typedOf,
  untouched,
  type BoxScoreState,
  type FinalScoreState,
  type FormState,
  type Refused,
  type TypedFields,
} from './form-state.ts';
import { boxScoreProblemKey, gamesProblemKey } from './problem-keys.ts';
import {
  runBoxScoreAction,
  type BoxScoreAction,
  type BoxScoreActionResult,
} from './run-box-score-action.ts';
import { runGameAction, type GameAction } from './run-game-action.ts';
import {
  gameAnchor,
  gameIdOf,
  scoreFields,
  typedScoresOf,
  wrongScoreFields,
} from './score-fields.ts';

/** The answers to the saves of the last ten minutes, by request (server/same-request.ts). */
const requests = () => sameRequestsHere<BoxScoreActionResult>();

/** The games area of the league the form came from, checked by the gate. */
async function gamesOf(fields: TypedFields) {
  // The route's league value only finds the page again; the gate checks it against the
  // address the proxy wrote down, and the context below is built from that.
  const view = await loadLeaguePage(fields['league'] ?? '', 'admin', 'games');
  const league = view.context.league;
  const context: CommandContext = commandContextOf(view.context);
  return {
    context,
    list: leagueUrl(league, 'admin-area', { area: 'games' }),
    sheet: (gameId: string) =>
      leagueUrl(league, 'admin-area', { area: 'games', subpath: [gameId] }),
  };
}

/** The one-time notice that the screen is to say "Saved" beside this game. */
function leaveNotice(context: CommandContext, screen: NoticeScreen, thing: string, said: string) {
  const holder = noticeHolderOf(context);
  if (holder !== undefined) savedNoticesHere().leave(holder, { screen, thing, said });
}

/**
 * The screen after a save, with its notice left: drawn again in the answer to the post
 * when the post came from the app's own scripts and the screen is the form's own (`here`);
 * else the browser is sent to `to` (post, redirect, get).
 */
async function showSaved(to: string, here: boolean): Promise<void> {
  // Next.js's own header on a post its scripts send; a form sent by the browser has none.
  if (here && (await headers()).has('next-action')) {
    refresh();
    return;
  }
  redirect(to);
}

/**
 * A refusal, drawn from the post. When the game itself may have changed, the screen is
 * drawn again as it is now (A-8: the latest is shown), keeping what was typed.
 */
function refused(
  code: string,
  typed: TypedFields,
  wrong: readonly string[],
  said: string,
): Refused {
  if (code !== 'invalid-input' && code !== 'reopen-reason') refresh();
  return { kind: 'refused', code, typed, wrong, said };
}

/**
 * The score boxes and the question before a final score is saved, all through one form
 * state (final-score-boxes.tsx), by the step the form says: `ask` (the boxes: nothing is
 * saved; the question, or the boxes refused), `change` (the question's "No": the boxes
 * again with what was typed) and `confirm` (the question's "Yes": the one form that saves
 * a final score; unconfirmed, it only asks).
 */
export async function finalScoreAction(
  _state: FinalScoreState,
  form: FormData,
): Promise<FinalScoreState> {
  const fields = typedOf(form);
  const { context, list } = await gamesOf(fields);
  const gameId = gameIdOf(fields['gameId']);
  const typed = { awayScore: fields['awayScore'] ?? '', homeScore: fields['homeScore'] ?? '' };
  if (gameId === undefined) {
    return refused('game-not-found', typed, [], t(gamesProblemKey('game-not-found')));
  }
  if (fields['step'] === 'change') return { kind: 'enter', typed };
  const version = (fields['version'] ?? '').trim();
  const scores = typedScoresOf(fields['homeScore'], fields['awayScore']);
  if (scores === undefined || !/^\d{1,9}$/.test(version)) {
    return refused(
      'invalid-input',
      typed,
      wrongScoreFields(fields),
      t(gamesProblemKey('invalid-input')),
    );
  }
  if (fields['step'] !== 'confirm' || fields['confirmed'] !== 'yes') {
    return { kind: 'ask', ...scores, version };
  }
  const { games } = await webPorts();
  const result = await requests().once(requestKeyOf(context, fields), () =>
    runGameAction('final', fields, context, games.deps),
  );
  if (result.ok) {
    leaveNotice(context, 'games', gameId, 'final');
    await showSaved(`${list}#${gameAnchor(gameId)}`, true);
    return untouched;
  }
  return refused(
    result.code,
    typed,
    result.code === 'tie-not-allowed' ? scoreFields : [],
    t(gamesProblemKey(result.code)),
  );
}

/** A forfeit, a postponement or a cancellation: saved, back to the game on the list. */
async function act(action: GameAction, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { context, list } = await gamesOf(fields);
  const gameId = gameIdOf(fields['gameId']);
  const { games } = await webPorts();
  const result = await requests().once(requestKeyOf(context, fields), () =>
    runGameAction(action, fields, context, games.deps),
  );
  if (result.ok && gameId !== undefined) {
    leaveNotice(context, 'games', gameId, action);
    await showSaved(`${list}#${gameAnchor(gameId)}`, true);
    return untouched;
  }
  if (result.ok) return redirect(list);
  return refused(result.code, fields, [], t(gamesProblemKey(result.code)));
}

export async function recordForfeitAction(_state: FormState, form: FormData): Promise<FormState> {
  return act('forfeit', form);
}
export async function postponeGameAction(_state: FormState, form: FormData): Promise<FormState> {
  return act('postpone', form);
}
export async function cancelGameAction(_state: FormState, form: FormData): Promise<FormState> {
  return act('cancel', form);
}

/** The box score grid's changes: run once per request, by the same rules. */
async function onBoxScore(action: BoxScoreAction, fields: TypedFields) {
  const { context, ...rest } = await gamesOf(fields);
  const { games } = await webPorts();
  const result = await requests().once(requestKeyOf(context, fields), () =>
    runBoxScoreAction(action, fields, context, games.deps),
  );
  return { result, context, gameId: gameIdOf(fields['gameId']), ...rest };
}

/** The grid saved: back to the game's grid, which says "Saved" naming the game and score. */
export async function saveBoxScoreAction(
  _state: BoxScoreState,
  form: FormData,
): Promise<BoxScoreState> {
  const fields = typedOf(form);
  const { result, context, gameId, list, sheet } = await onBoxScore('save', fields);
  if (result.ok) {
    if (gameId === undefined) return redirect(list);
    leaveNotice(context, 'box-score', gameId, 'save');
    await showSaved(`${sheet(gameId)}#${sheetScoresId}`, true);
    return untouched;
  }
  return {
    ...refused(result.code, fields, result.wrong ?? [], t(boxScoreProblemKey(result.code))),
    ...(result.scores === undefined ? {} : { scores: result.scores }),
  };
}

/**
 * The game reopened to correct it: back to its grid; or, for a game that was not entered
 * as a box score (a final score typed by hand, a forfeit, a game its tracker ended), to
 * the games list beside it, where its result is entered again or it is scored in the
 * tracker.
 */
export async function reopenBoxScoreAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { result, context, gameId, list, sheet } = await onBoxScore('reopen', fields);
  if (result.ok) {
    if (gameId === undefined) return redirect(list);
    if (fields['then'] === 'games') {
      leaveNotice(context, 'games', gameId, 'reopen');
      return redirect(`${list}#${gameAnchor(gameId)}`);
    }
    leaveNotice(context, 'box-score', gameId, 'reopen');
    await showSaved(sheet(gameId), true);
    return untouched;
  }
  return refused(
    result.code,
    fields,
    result.code === 'reopen-reason' ? ['reason'] : [],
    t(boxScoreProblemKey(result.code)),
  );
}
