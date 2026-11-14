'use server';
// The games area's server actions. Who is asking and which league come from the session
// and the address (loadLeaguePage), never from the form; the form only says which game
// and what to do. Each action sends the browser back to the games area with a notice.
import { leagueUrl } from '@srleagues/core';
import { redirect } from 'next/navigation';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { runBoxScoreAction, type BoxScoreAction } from './run-box-score-action.ts';
import { runGameAction, type GameAction } from './run-game-action.ts';

async function act(action: GameAction, form: FormData): Promise<never> {
  const fields: Record<string, string> = {};
  for (const [name, value] of form.entries()) if (typeof value === 'string') fields[name] = value;
  // The route's league value only finds the page again; the gate checks it against the
  // address the proxy wrote down, and the context below is built from that.
  const view = await loadLeaguePage(fields['league'] ?? '', 'admin', 'games');
  const { games } = await webPorts();
  const result = await runGameAction(action, fields, commandContextOf(view.context), games.deps);
  const back = leagueUrl(view.context.league, 'admin-area', { area: 'games' });
  const query = result.ok ? `?done=${action}` : `?problem=${encodeURIComponent(result.code)}`;
  return redirect(back + query);
}

export async function enterFinalScoreAction(form: FormData): Promise<never> {
  return act('final', form);
}
export async function recordForfeitAction(form: FormData): Promise<never> {
  return act('forfeit', form);
}
export async function postponeGameAction(form: FormData): Promise<never> {
  return act('postpone', form);
}
export async function cancelGameAction(form: FormData): Promise<never> {
  return act('cancel', form);
}

/** The box score grid's changes: back to the game's grid with a notice. */
async function actOnBoxScore(action: BoxScoreAction, form: FormData): Promise<never> {
  const fields: Record<string, string> = {};
  for (const [name, value] of form.entries()) if (typeof value === 'string') fields[name] = value;
  const view = await loadLeaguePage(fields['league'] ?? '', 'admin', 'games');
  const { games } = await webPorts();
  const result = await runBoxScoreAction(
    action,
    fields,
    commandContextOf(view.context),
    games.deps,
  );
  const gameId = fields['gameId'] ?? '';
  const back = /^[0-9a-f-]{36}$/i.test(gameId)
    ? leagueUrl(view.context.league, 'admin-area', { area: 'games', subpath: [gameId] })
    : leagueUrl(view.context.league, 'admin-area', { area: 'games' });
  const query = result.ok ? `?done=${action}` : `?problem=${encodeURIComponent(result.code)}`;
  return redirect(back + query);
}

export async function saveBoxScoreAction(form: FormData): Promise<never> {
  return actOnBoxScore('save', form);
}
export async function reopenBoxScoreAction(form: FormData): Promise<never> {
  return actOnBoxScore('reopen', form);
}
