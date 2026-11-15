'use server';
// The games area's server actions. Who is asking and which league come from the session
// and the address (loadLeaguePage), never from the form; the form only says which game
// and what to do. Each action sends the browser back to the games area with a notice,
// to the game's own place on the list, so the answer is beside the game (step 2.154).
//
// A final score takes two steps of its own on the server (A-5): the score boxes' form
// only asks (askFinalScoreAction changes nothing and comes back with the question beside
// the game), and only the question's own form, which says it was confirmed, saves it.
// So a double tap, or going back and sending the boxes again, only asks again.
import { leagueUrl } from '@srleagues/core';
import { redirect } from 'next/navigation';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { gameIdOf, gamesReturn, typedScoresOf } from './games-search.ts';
import { runBoxScoreAction, type BoxScoreAction } from './run-box-score-action.ts';
import { runGameAction, type GameAction } from './run-game-action.ts';

function fieldsOf(form: FormData): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [name, value] of form.entries()) if (typeof value === 'string') fields[name] = value;
  return fields;
}

/** The games area of the league the form came from, checked by the gate. */
async function gamesOf(fields: Readonly<Record<string, string>>) {
  // The route's league value only finds the page again; the gate checks it against the
  // address the proxy wrote down, and the context below is built from that.
  const view = await loadLeaguePage(fields['league'] ?? '', 'admin', 'games');
  return { view, back: leagueUrl(view.context.league, 'admin-area', { area: 'games' }) };
}

async function act(action: GameAction, fields: Readonly<Record<string, string>>): Promise<never> {
  const { view, back } = await gamesOf(fields);
  const { games } = await webPorts();
  const result = await runGameAction(action, fields, commandContextOf(view.context), games.deps);
  const gameId = gameIdOf(fields['gameId']);
  const said = result.ok ? { done: action } : { problem: result.code };
  return redirect(
    back + gamesReturn(gameId === undefined ? said : { ...said, game: gameId }, gameId),
  );
}

/**
 * The score boxes' form: nothing is saved. Back to the list with the question beside the
 * game, naming both teams and the score; or, when the boxes do not hold two whole numbers,
 * the boxes open again with a notice.
 */
export async function askFinalScoreAction(form: FormData): Promise<never> {
  const fields = fieldsOf(form);
  const { back } = await gamesOf(fields);
  const gameId = gameIdOf(fields['gameId']);
  const version = (fields['version'] ?? '').trim();
  const typed = typedScoresOf(fields['homeScore'], fields['awayScore']);
  if (gameId === undefined) return redirect(back + gamesReturn({ problem: 'game-not-found' }));
  if (typed === undefined || !/^\d{1,9}$/.test(version)) {
    return redirect(
      back + gamesReturn({ problem: 'invalid-input', game: gameId, enter: gameId }, gameId),
    );
  }
  return redirect(
    back +
      gamesReturn(
        { ask: gameId, v: version, home: typed.homeScore, away: typed.awayScore },
        gameId,
      ),
  );
}

/** The question's "Yes": the one form that saves a final score. Unconfirmed, it asks again. */
export async function enterFinalScoreAction(form: FormData): Promise<never> {
  const fields = fieldsOf(form);
  if (fields['confirmed'] !== 'yes') return askFinalScoreAction(form);
  return act('final', fields);
}
export async function recordForfeitAction(form: FormData): Promise<never> {
  return act('forfeit', fieldsOf(form));
}
export async function postponeGameAction(form: FormData): Promise<never> {
  return act('postpone', fieldsOf(form));
}
export async function cancelGameAction(form: FormData): Promise<never> {
  return act('cancel', fieldsOf(form));
}

/**
 * The box score grid's changes: back to the game's grid with a notice. A game reopened
 * there that was not entered as a box score (a final score typed by hand, a forfeit, a
 * game its tracker ended) goes back to the games list instead, beside the game, where its
 * result is entered again or it is scored in the tracker.
 */
async function actOnBoxScore(action: BoxScoreAction, form: FormData): Promise<never> {
  const fields = fieldsOf(form);
  const view = await loadLeaguePage(fields['league'] ?? '', 'admin', 'games');
  const { games } = await webPorts();
  const result = await runBoxScoreAction(
    action,
    fields,
    commandContextOf(view.context),
    games.deps,
  );
  const gameId = gameIdOf(fields['gameId']);
  if (result.ok && action === 'reopen' && fields['then'] === 'games' && gameId !== undefined) {
    const list = leagueUrl(view.context.league, 'admin-area', { area: 'games' });
    return redirect(list + gamesReturn({ done: 'reopen', game: gameId, enter: gameId }, gameId));
  }
  const back =
    gameId === undefined
      ? leagueUrl(view.context.league, 'admin-area', { area: 'games' })
      : leagueUrl(view.context.league, 'admin-area', { area: 'games', subpath: [gameId] });
  const query = result.ok ? `?done=${action}` : `?problem=${encodeURIComponent(result.code)}`;
  return redirect(back + query);
}

export async function saveBoxScoreAction(form: FormData): Promise<never> {
  return actOnBoxScore('save', form);
}
export async function reopenBoxScoreAction(form: FormData): Promise<never> {
  return actOnBoxScore('reopen', form);
}
