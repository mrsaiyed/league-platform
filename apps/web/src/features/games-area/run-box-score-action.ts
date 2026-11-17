// One change from the box score grid: save the sheet, or reopen a final game to correct
// it (S-7), by the door the page offered (reopen-view.ts). The form's words become a games command's input, and the command runs with
// the context the server worked out from the session (T-23). The sheet is read again
// first, so the grid is read against the players and columns the game has now.
//
// A refusal says which boxes are wrong and the score the sheet came to (step 2.155), so
// the grid marks them and keeps what was typed. A sheet sent twice (a double tap) is
// known as the same request before it gets here (server/same-request.ts, record 067).
import {
  getBoxScoreSheet,
  reopenGame,
  reopenTrackedGame,
  setBoxScore,
  type CommandContext,
  type CommandDeps,
  type TrackerTx,
} from '@srleagues/core';
import { readBoxScoreForm, wrongBoxScoreFields, type BoxScoreFields } from './box-score-form.ts';

export const boxScoreActions = ['save', 'reopen'] as const;
export type BoxScoreAction = (typeof boxScoreActions)[number];

export function isBoxScoreAction(value: unknown): value is BoxScoreAction {
  return boxScoreActions.some((a) => a === value);
}

export type BoxScoreActionResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: string;
      /** The fields to mark, in screen order. */
      readonly wrong?: readonly string[];
      /** The score the sheet came to, when it was read. */
      readonly scores?: { readonly home: number; readonly away: number };
    };

const versionOf = (text: string | undefined): number | undefined =>
  /^\d+$/.test((text ?? '').trim()) ? Number(text) : undefined;

export async function runBoxScoreAction(
  action: BoxScoreAction,
  fields: BoxScoreFields,
  context: CommandContext,
  deps: CommandDeps<TrackerTx>,
): Promise<BoxScoreActionResult> {
  const gameId = fields['gameId'];
  const version = versionOf(fields['version']);
  if (action === 'reopen') {
    // A game its tracker ended is reopened through the tracker's own door (step 2.120),
    // which also lets the scorekeeper who ended it do so within the league's minutes; the
    // form's request id, made once when the form was drawn, makes a second send of it
    // the same reopen. Any other decided game through the admin's door (S-7).
    const reopened =
      fields['door'] === 'tracked'
        ? await reopenTrackedGame(
            context,
            {
              gameId: gameId?.toLowerCase(),
              requestId: fields['requestId'],
              reason: fields['reason'],
            },
            deps,
          )
        : await reopenGame(context, { gameId, version, reason: fields['reason'] }, deps);
    if (reopened.ok) return { ok: true };
    // The admin's door sent twice (a double tap on "Reopen to correct"): the first reopened
    // it, the second is refused as changed or not decided. The game is already where this
    // tap asked it to be, so carry on as if it had done it (step 2.154).
    if (
      (reopened.error.code === 'changed-since-read' ||
        reopened.error.code === 'game-not-decided') &&
      version !== undefined
    ) {
      const now = await getBoxScoreSheet(context, { gameId }, deps);
      const status = now.ok ? now.value.game.status : '';
      if (now.ok && now.value.game.version > version && ['scheduled', 'live'].includes(status)) {
        return { ok: true };
      }
    }
    // The reopen form's one typed field is the reason, so input it refuses is the reason
    // missing or too long: say that, not the grid's message about numbers.
    const code = reopened.error.code === 'invalid-input' ? 'reopen-reason' : reopened.error.code;
    return { ok: false, code };
  }
  const sheet = await getBoxScoreSheet(context, { gameId }, deps);
  if (!sheet.ok) return { ok: false, code: sheet.error.code };
  // A sheet typed on a page drawn before the game was postponed or cancelled (step 2.158):
  // said as that, not as "someone changed this game"; the grid keeps what was typed.
  const now = sheet.value.game.status;
  if (now === 'postponed') return { ok: false, code: 'game-postponed' };
  if (now === 'cancelled') return { ok: false, code: 'game-cancelled' };
  const input = readBoxScoreForm(sheet.value, fields);
  if (input === undefined) {
    return { ok: false, code: 'invalid-input', wrong: wrongBoxScoreFields(sheet.value, fields) };
  }
  const saved = await setBoxScore(context, { gameId, version, ...input }, deps);
  if (saved.ok) return { ok: true };
  const code = saved.error.code;
  // A tie is the two scores: both are marked, and the sentence names the score.
  return code === 'tie-not-allowed'
    ? {
        ok: false,
        code,
        wrong: ['awayScore', 'homeScore'],
        scores: { home: input.homeScore, away: input.awayScore },
      }
    : { ok: false, code };
}
