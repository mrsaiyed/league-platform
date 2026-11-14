// One change to a game from the games area's forms: the form's words become a games
// command's input, and the command runs with the context the server worked out from the
// session (T-23). Nothing here reads who is asking from the form.
import {
  cancelGame,
  postponeGame,
  recordFinalScore,
  recordForfeit,
  type CommandContext,
  type CommandDeps,
  type GamesTx,
} from '@srleagues/core';

export const gameActions = ['final', 'forfeit', 'postpone', 'cancel'] as const;
export type GameAction = (typeof gameActions)[number];

export function isGameAction(value: unknown): value is GameAction {
  return gameActions.some((a) => a === value);
}

/** What a form held: text only, by field name. */
export type GameFields = Readonly<Record<string, string | undefined>>;

export type GameActionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: string };

/** A whole number written in a field; undefined (so the command refuses it) when it is not. */
function numberOf(text: string | undefined): number | undefined {
  const trimmed = (text ?? '').trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : undefined;
}

export async function runGameAction(
  action: GameAction,
  fields: GameFields,
  context: CommandContext,
  deps: CommandDeps<GamesTx>,
): Promise<GameActionResult> {
  const base = { gameId: fields['gameId'], version: numberOf(fields['version']) };
  const result = await (async () => {
    switch (action) {
      case 'final':
        return recordFinalScore(
          context,
          {
            ...base,
            homeScore: numberOf(fields['homeScore']),
            awayScore: numberOf(fields['awayScore']),
          },
          deps,
        );
      case 'forfeit':
        return recordForfeit(
          context,
          { ...base, forfeitingTeamId: fields['forfeitingTeamId'] },
          deps,
        );
      case 'postpone':
        return postponeGame(context, base, deps);
      case 'cancel':
        return cancelGame(context, base, deps);
    }
  })();
  return result.ok ? { ok: true } : { ok: false, code: result.error.code };
}
