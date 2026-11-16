// One change to a game from the games area's forms: the form's words become a games
// command's input, and the command runs with the context the server worked out from the
// session (T-23). Nothing here reads who is asking from the form.
//
// A final score sent twice (a double tap on "Yes, make it final": the first saves it, the
// second is refused as changed or already decided) is answered as saved when the game is
// now final with exactly the score that was asked (step 2.154), so the person reads
// "Saved", not that someone changed the game.
import {
  cancelGame,
  getBoxScoreSheet,
  postponeGame,
  putGameBack,
  recordFinalScore,
  recordForfeit,
  type CommandContext,
  type CommandDeps,
  type TrackerTx,
} from '@srleagues/core';

export const gameActions = ['final', 'forfeit', 'postpone', 'cancel', 'putBack'] as const;
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
  deps: CommandDeps<TrackerTx>,
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
      // A cancelled game put back (step 2.158, S-51), with why from the fixed list.
      case 'putBack':
        return putGameBack(context, { ...base, reason: fields['reason'] }, deps);
    }
  })();
  if (result.ok) return { ok: true };
  const code = result.error.code;
  if (
    action === 'final' &&
    (code === 'changed-since-read' || code === 'game-already-decided') &&
    (await isFinalWith(fields, context, deps))
  ) {
    return { ok: true };
  }
  // A score typed for a game postponed or cancelled since the page was drawn (step 2.158):
  // said as that, not as "someone changed this game", so the person knows why.
  if (action === 'final' && code === 'changed-since-read') {
    const now = await statusNow(fields, context, deps);
    if (now === 'postponed') return { ok: false, code: 'game-postponed' };
    if (now === 'cancelled') return { ok: false, code: 'game-cancelled' };
  }
  return { ok: false, code };
}

/** The game's status as it is now, or undefined if it cannot be read. */
async function statusNow(
  fields: GameFields,
  context: CommandContext,
  deps: CommandDeps<TrackerTx>,
): Promise<string | undefined> {
  const read = await getBoxScoreSheet(context, { gameId: fields['gameId'] }, deps);
  return read.ok ? read.value.game.status : undefined;
}

/** Whether the game is final now with exactly the score these fields asked for. */
async function isFinalWith(
  fields: GameFields,
  context: CommandContext,
  deps: CommandDeps<TrackerTx>,
): Promise<boolean> {
  const [homeScore, awayScore] = [numberOf(fields['homeScore']), numberOf(fields['awayScore'])];
  if (homeScore === undefined || awayScore === undefined) return false;
  const read = await getBoxScoreSheet(context, { gameId: fields['gameId'] }, deps);
  return (
    read.ok &&
    read.value.game.status === 'final' &&
    read.value.game.homeScore === homeScore &&
    read.value.game.awayScore === awayScore
  );
}
