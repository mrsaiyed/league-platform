// One change from the box score grid: save the sheet, or reopen a final game to correct
// it (S-7). The form's words become a games command's input, and the command runs with
// the context the server worked out from the session (T-23). The sheet is read again
// first, so the grid is read against the players and columns the game has now.
import {
  getBoxScoreSheet,
  reopenGame,
  setBoxScore,
  type CommandContext,
  type CommandDeps,
  type GamesTx,
} from '@srleagues/core';
import { readBoxScoreForm, type BoxScoreFields } from './box-score-form.ts';
import type { GameActionResult } from './run-game-action.ts';

export const boxScoreActions = ['save', 'reopen'] as const;
export type BoxScoreAction = (typeof boxScoreActions)[number];

export function isBoxScoreAction(value: unknown): value is BoxScoreAction {
  return boxScoreActions.some((a) => a === value);
}

const versionOf = (text: string | undefined): number | undefined =>
  /^\d+$/.test((text ?? '').trim()) ? Number(text) : undefined;

export async function runBoxScoreAction(
  action: BoxScoreAction,
  fields: BoxScoreFields,
  context: CommandContext,
  deps: CommandDeps<GamesTx>,
): Promise<GameActionResult> {
  const gameId = fields['gameId'];
  const version = versionOf(fields['version']);
  if (action === 'reopen') {
    const reopened = await reopenGame(context, { gameId, version, reason: fields['reason'] }, deps);
    if (reopened.ok) return { ok: true };
    // The reopen form's one typed field is the reason, so input it refuses is the reason
    // missing or too long: say that, not the grid's message about numbers.
    const code = reopened.error.code === 'invalid-input' ? 'reopen-reason' : reopened.error.code;
    return { ok: false, code };
  }
  const sheet = await getBoxScoreSheet(context, { gameId }, deps);
  if (!sheet.ok) return { ok: false, code: sheet.error.code };
  const input = readBoxScoreForm(sheet.value, fields);
  if (input === undefined) return { ok: false, code: 'invalid-input' };
  const saved = await setBoxScore(context, { gameId, version, ...input }, deps);
  return saved.ok ? { ok: true } : { ok: false, code: saved.error.code };
}
