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
// asks again. A forfeit, a postponement and a cancellation take the same two steps (step
// 2.158, callOffAction); a cancelled game is put back in one, with a reason chosen.
import { gameAnchor, leagueUrl, listPostponedGames, type CommandContext } from '@srleagues/core';
import { mayGiveNewDates, takeBackNewDate } from '../schedule-builder/index.ts';
import { newDateAnchor } from './waiting-anchor.ts';
import { refresh } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import { questionKeyOf, questionTimesHere } from '../../server/question-times.ts';
import { requestKeyOf, sameRequestsHere } from '../../server/same-request.ts';
import { noticeHolderOf, savedNoticesHere, type NoticeScreen } from '../../server/saved-notice.ts';
import { callOffStep, choiceOf, newDateNow, newDateRefused } from './call-off-step.ts';
import {
  sheetScoresId,
  typedOf,
  untouched,
  type BoxScoreState,
  type CallOffState,
  type FinalScoreState,
  type FormState,
  type Refused,
  type TypedFields,
} from './form-state.ts';
import { boxScoreProblemKey, gamesProblemKey, putBackProblemKey } from './problem-keys.ts';
import {
  runBoxScoreAction,
  type BoxScoreAction,
  type BoxScoreActionResult,
} from './run-box-score-action.ts';
import { runGameAction, type GameAction, type GameActionResult } from './run-game-action.ts';
import { runTrackedGridAction, type TrackedGridResult } from './run-tracked-grid-action.ts';
import { playMark } from './tracked-grid.ts';
import { trackedGridProblemKey } from './problem-keys.ts';
import { gameIdOf, scoreFields, typedScoresOf, wrongScoreFields } from './score-fields.ts';

/** A tracked game's grid saved (step 2.65): the same, for its own answer. */
const gridRequests = () => sameRequestsHere<TrackedGridResult>();
/** The answers to the saves of the last ten minutes, by request (server/same-request.ts). */
const requests = () => sameRequestsHere<BoxScoreActionResult>();
/** The same, for the games list's changes, whose answer may say what a game is now. */
const gameRequests = () => sameRequestsHere<GameActionResult>();

/** The games area of the league the form came from, checked by the gate. */
async function gamesOf(fields: TypedFields) {
  // The route's league value only finds the page again; the gate checks it against the
  // address the proxy wrote down, and the context below is built from that.
  const view = await loadLeaguePage(fields['league'] ?? '', 'admin', 'games');
  const league = view.context.league;
  const context: CommandContext = commandContextOf(view.context);
  return {
    context,
    league,
    list: leagueUrl(league, 'admin-area', { area: 'games' }),
    sheet: (gameId: string) =>
      leagueUrl(league, 'admin-area', { area: 'games', subpath: [gameId] }),
  };
}

/** The one-time notice that the screen is to say "Saved" beside this game. */
function leaveNotice(
  context: CommandContext,
  screen: NoticeScreen,
  thing: string,
  said: string,
  about?: readonly string[],
) {
  const holder = noticeHolderOf(context);
  if (holder === undefined) return;
  savedNoticesHere().leave(holder, {
    screen,
    thing,
    said,
    ...(about === undefined || about.length === 0 ? {} : { about }),
  });
}

/**
 * The form's own screen after a save, with its notice left: drawn again in the answer to
 * the post when the post came from the app's own scripts; else the browser is sent to `to`
 * on that screen (post, redirect, get). A save that leads to another screen redirects.
 */
async function showSaved(to: string): Promise<void> {
  // Next.js's own header on a post its scripts send; a form sent by the browser has none.
  if ((await headers()).has('next-action')) {
    refresh();
    return;
  }
  redirect(to);
}

/** A put back's refusals said beside its form as it is (step 2.229). */
const putBackSaid: readonly string[] = [
  'put-back-reason',
  'newer-save',
  'no-sheet-kept',
  'game-not-decided',
  'scored-live',
  'player-gone',
];

/** Refusals answered without drawing the screen again (see `refused`). */
const keptAsIs: readonly string[] = [
  'invalid-input',
  'reopen-reason',
  'game-postponed',
  'game-cancelled',
  'choose-team',
  'choose-reason',
];

/**
 * A refusal, drawn from the post. When the game itself may have changed, the screen is
 * drawn again as it is now (A-8: the latest is shown), keeping what was typed.
 */
function refused(
  code: string,
  typed: TypedFields,
  wrong: readonly string[],
  said: string,
  /** Answered beside the form as it is, whatever the code (a put back refused, step 2.229). */
  keep = false,
): Refused {
  // Not for a game called off since the form was drawn (step 2.158): drawn again, it would
  // have no score boxes, and the sentence saying why the score was refused would go with
  // them. It stays beside the boxes, which say nothing more is saved.
  if (!keep && !keptAsIs.includes(code)) refresh();
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
  const typed = {
    awayScore: fields['awayScore'] ?? '',
    homeScore: fields['homeScore'] ?? '',
    overtime: fields['overtime'] ?? '',
  };
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
    // The question names the score as a number; "No" gives back exactly what was typed.
    return { kind: 'ask', ...scores, version, typed };
  }
  const { games } = await webPorts();
  const result = await requests().once(requestKeyOf(context, fields), () =>
    runGameAction('final', fields, context, games.deps),
  );
  if (result.ok) {
    leaveNotice(context, 'games', gameId, 'final');
    await showSaved(`${list}#${gameAnchor(gameId)}`);
    return untouched;
  }
  return refused(
    result.code,
    typed,
    result.code === 'tie-not-allowed' ? scoreFields : [],
    t(gamesProblemKey(result.code)),
  );
}

/**
 * A change with no typed boxes (a forfeit, a postponement, a cancellation, a cancelled game
 * put back): saved, back to the game on the list. `field` is the form's one choice, marked
 * when the command says it is what was wrong.
 */
async function act(
  action: GameAction,
  fields: TypedFields,
  field: string | undefined,
): Promise<Refused | typeof untouched> {
  const { context, league, list } = await gamesOf(fields);
  const gameId = gameIdOf(fields['gameId']);
  if (action === 'postpone' && newDateRefused(fields, await mayGiveNewDates(league, context))) {
    return refused('not-allowed', fields, [], t(gamesProblemKey('not-allowed')));
  }
  const { games } = await webPorts();
  // A postponed game put back on its date: its season, read before, so a new date the
  // schedule draft gives it is taken back after (step 2.53 fix round).
  const waitingIn =
    fields['act'] === 'restore' && gameId !== undefined
      ? await listPostponedGames(context, {}, games.deps).then((r) =>
          r.ok ? r.value.find((g) => g.id === gameId)?.seasonId : undefined,
        )
      : undefined;
  const result = await gameRequests().once(requestKeyOf(context, fields), () =>
    runGameAction(action, fields, context, games.deps),
  );
  if (result.ok && gameId !== undefined && waitingIn !== undefined) {
    await takeBackNewDate(context, waitingIn, gameId);
  }
  if (result.ok && gameId !== undefined) {
    // A game put back says what it is now, and names any game that took its place since.
    const said =
      result.putBack === undefined
        ? action
        : fields['act'] === 'restore'
          ? 'putBackDate'
          : result.putBack.status === 'postponed'
            ? 'putBackPostponed'
            : 'putBack';
    leaveNotice(context, 'games', gameId, said, result.putBack?.clashes);
    // Postponed with its new date given at once (S-49): to its "Give it a new date".
    const place =
      action === 'postpone' && fields['newDate'] === newDateNow
        ? newDateAnchor(gameId)
        : gameAnchor(gameId);
    // Sent from another screen (a game's own page): to the list, where "Saved" is.
    if (fields['then'] === 'games') return redirect(`${list}#${place}`);
    await showSaved(`${list}#${place}`);
    return untouched;
  }
  if (result.ok) return redirect(list);
  // Called off by someone else meanwhile (step 2.221): the game is drawn again as it is now,
  // which may take away the panel this form is in, and its sentence with it. So it is left
  // as a notice and said beside the game, as "Saved" is, never in the form.
  if (gameId !== undefined && calledOffMeanwhile.includes(result.code)) {
    leaveNotice(context, 'games', gameId, result.code);
    if (fields['then'] === 'games') return redirect(`${list}#${gameAnchor(gameId)}`);
    await showSaved(`${list}#${gameAnchor(gameId)}`);
    return untouched;
  }
  // A team not in the game, or a reason not on the list, is the form's one field: marked,
  // and said as that field's own sentence (a choice sent tampered with, step 2.158).
  const fieldWrong =
    field !== undefined && (result.code === 'team-not-in-game' || result.code === 'invalid-input');
  const code =
    fieldWrong && result.code === 'invalid-input'
      ? field === 'reason'
        ? 'choose-reason'
        : 'choose-team'
      : result.code;
  return refused(code, fields, fieldWrong ? [field] : [], t(gamesProblemKey(code)));
}

/** A change refused because the game was called off since the form was drawn. */
const calledOffMeanwhile: readonly string[] = ['game-now-cancelled', 'game-now-postponed'];

/** The form's one choice left empty: refused beside it, nothing sent to the command. */
function notChosen(fields: TypedFields, field: string, code: string): Refused {
  return { kind: 'refused', code, typed: fields, wrong: [field], said: t(gamesProblemKey(code)) };
}

/**
 * "Forfeit, postpone or cancel" and "Put it back on its date" (step 2.158; A-5, S-75), by
 * the step the form says (call-off-step.ts): one of the forms only asks (or is refused
 * beside its empty choice, checked here too: the browser's own `required` can be got
 * round); the question's "No" changes nothing; only its "Yes", read for long enough, runs
 * the change. So a double tap, or going back and sending a form again, only asks again.
 */
export async function callOffAction(_state: CallOffState, form: FormData): Promise<CallOffState> {
  const fields = typedOf(form);
  // The page check (loadLeaguePage) runs first, whatever the step.
  const { context } = await gamesOf(fields);
  // The question's first time, kept with the asking form's token (step 2.221), never the
  // form's own: a "Yes" too soon keeps it, and a hand-made "Yes" with no question asks.
  const times = questionTimesHere();
  const key = questionKeyOf(context, fields);
  const step = callOffStep(fields, Date.now(), times.of(key));
  if (step === undefined) {
    return refused('game-not-found', fields, [], t(gamesProblemKey('game-not-found')));
  }
  if (step.kind === 'back') {
    times.forget(key);
    return untouched;
  }
  if (step.kind === 'refused') return notChosen(fields, step.field, step.code);
  if (step.kind === 'ask') {
    times.keep(key, step.askedAt);
    const { act: asked, askedAt, readyInMs } = step;
    return { kind: 'ask', act: asked, typed: fields, askedAt, readyInMs };
  }
  times.forget(key);
  const action: GameAction = step.act === 'restore' ? 'putBack' : step.act;
  return act(action, fields, choiceOf[step.act]?.field);
}

/** "Put this game back" (step 2.158, S-51): a cancelled game, with why from the fixed list. */
export async function putBackAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  if ((fields['reason'] ?? '').trim() === '') return notChosen(fields, 'reason', 'choose-reason');
  return act('putBack', fields, 'reason');
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
    await showSaved(`${sheet(gameId)}#${sheetScoresId}`);
    return untouched;
  }
  return {
    ...refused(result.code, fields, result.wrong ?? [], t(boxScoreProblemKey(result.code))),
    ...(result.scores === undefined ? {} : { scores: result.scores }),
  };
}

/**
 * The game reopened to correct it: back to its page; or, for a game that was not entered
 * as a box score (a final score typed by hand, a forfeit, a game its tracker ended that
 * this person may not edit in its grid), to the games list beside it, where its result is
 * entered again or it is scored in the tracker. The page's form says which (`then`).
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
    await showSaved(sheet(gameId));
    return untouched;
  }
  return refused(
    result.code,
    fields,
    result.code === 'reopen-reason' ? ['reason'] : [],
    t(boxScoreProblemKey(result.code)),
  );
}

/**
 * The box score put back as the game's last reopen kept it (step 2.229, T-366): back to
 * its grid, which says so once. Refused (something newer saved, the game reopened, the
 * page old), the sentence says why in plain words and the reason keeps what was typed.
 */
export async function putSheetBackAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { result, context, gameId, list, sheet } = await onBoxScore('put-back', fields);
  if (result.ok) {
    if (gameId === undefined) return redirect(list);
    leaveNotice(context, 'box-score', gameId, 'put-back');
    await showSaved(sheet(gameId));
    return untouched;
  }
  return refused(
    result.code,
    fields,
    result.code === 'put-back-reason' ? ['reason'] : [],
    t(putBackProblemKey(result.code)),
    // Drawn again the page would no longer hold the offer, and the sentence saying why it
    // was refused would go with it: it stays beside the reason, which says nothing was saved.
    putBackSaid.includes(result.code),
  );
}

/**
 * A tracked game's "edit box score" grid saved (step 2.65, T-122): back to the grid, which
 * says once, in plain sentences, the plays the save added to the game's list of plays. A
 * refusal is answered beside the form as it is, keeping every box as typed, and the screen
 * is not drawn again: drawn again, a game someone else changed meanwhile would hand back
 * its new `sequence` under boxes typed against the old numbers, and a second tap would
 * save them. The sentence says to load it again instead.
 */
export async function correctTrackedGridAction(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const fields = typedOf(form);
  const { context, league } = await gamesOf(fields);
  const gameId = gameIdOf(fields['gameId']);
  const { games } = await webPorts();
  const result = await gridRequests().once(requestKeyOf(context, fields), () =>
    runTrackedGridAction(fields, context, games.deps),
  );
  if (result.ok && gameId !== undefined) {
    leaveNotice(context, 'tracked-grid', gameId, 'save', result.plays.map(playMark));
    // An empty list of marks leaves none: the screen then says nothing was changed.
    await showSaved(leagueUrl(league, 'admin-area', { area: 'games', subpath: [gameId, 'edit'] }));
    return untouched;
  }
  const code = result.ok ? 'gone' : result.code;
  return {
    kind: 'refused',
    code,
    typed: fields,
    wrong: result.ok ? [] : (result.wrong ?? []),
    said: t(trackedGridProblemKey(code), { cell: '{cell}' }),
  };
}
