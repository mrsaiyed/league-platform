// A tracked game's "edit box score" grid saved (step 2.65, T6 §8, T-122): the form read
// against the grid as it was drawn (the read's `sequence` handed back), the plays it makes
// worked out by core's own rule (gridCorrectionPlays, as the command does, so the
// sentences said after the save are the plays in the log), and the command run. A
// refusal names the box it is about when it is about one.
import {
  correctTrackedBoxScore,
  getBoxScoreSheet,
  gridCorrectionPlays,
  readTrackedBoxScore,
  type CommandContext,
  type CommandDeps,
  type GridPlay,
  type TrackerTx,
} from '@srleagues/core';
import type { TypedFields } from './form-state.ts';
import {
  readTrackedGrid,
  replayedOf,
  trackedGridColumns,
  trackedGridField,
  type TrackedGridCount,
} from './tracked-grid.ts';

export type TrackedGridResult =
  | { readonly ok: true; readonly plays: readonly GridPlay[] }
  | {
      readonly ok: false;
      /** A key's last part under `admin.boxScore.tracked.refused.` (trackedGridProblemKey). */
      readonly code: string;
      readonly wrong?: readonly string[];
    };

const sequenceOf = (text: string | undefined): number | undefined =>
  /^\d{1,15}$/.test((text ?? '').trim()) ? Number(text) : undefined;

/** A refusal about one player: their first box, or the box of the count it names. */
const about = (code: string, personId: string, stat: TrackedGridCount = 'fg1') => ({
  ok: false as const,
  code,
  wrong: [trackedGridField(personId, stat)],
});

export async function runTrackedGridAction(
  fields: TypedFields,
  context: CommandContext,
  deps: CommandDeps<TrackerTx>,
): Promise<TrackedGridResult> {
  const gameId = (fields['gameId'] ?? '').toLowerCase();
  const sequence = sequenceOf(fields['sequence']);
  const read = await readTrackedBoxScore(context, { gameId }, deps);
  const sheet = await getBoxScoreSheet(context, { gameId }, deps);
  if (!read.ok || !sheet.ok || !read.value.correctable) return { ok: false, code: 'gone' };
  if (sequence === undefined || sequence !== read.value.sequence) {
    return { ok: false, code: 'changed-since-read' };
  }
  const typed = readTrackedGrid(read.value, trackedGridColumns(sheet.value.statKeys), fields);
  if (!typed.ok) {
    return {
      ok: false,
      code: typed.code === 'invalid-input' ? 'cell' : typed.code,
      wrong: typed.wrong,
    };
  }
  const made = gridCorrectionPlays(sheet.value.game, replayedOf(read.value.lines), typed.lines);
  const saved = await correctTrackedBoxScore(
    context,
    { gameId, sequence, lines: typed.lines },
    deps,
  );
  if (saved.ok) return { ok: true, plays: made.ok ? made.plays : [] };
  const error = saved.error;
  if (error.code === 'changed-since-read' || error.code === 'too-many-plays') {
    return { ok: false, code: error.code };
  }
  if (error.code === 'rule' && error.problem === 'basket-taken-back') {
    return about('basket-taken-back', error.personId, error.stat);
  }
  if (error.code === 'rule') return about('engine', error.personId);
  if (error.code === 'player-not-on-team') return about(error.code, error.personId);
  if (error.code === 'statistic-not-kept') {
    return about(error.code, error.personId, 'turnovers');
  }
  return { ok: false, code: 'gone' };
}

/**
 * "End the game again" (step 2.65 fix round, T-407): the scoring screen's own End game
 * tap, sent through the grid's command with no lines, against the game as the page drew
 * it. No device is taken over: one that holds the game learns it at its next tap.
 */
export async function runEndAgainAction(
  fields: TypedFields,
  context: CommandContext,
  deps: CommandDeps<TrackerTx>,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly code: string }> {
  const gameId = (fields['gameId'] ?? '').toLowerCase();
  const sequence = sequenceOf(fields['sequence']);
  const read = await readTrackedBoxScore(context, { gameId }, deps);
  if (!read.ok || !read.value.correctable) return { ok: false, code: 'gone' };
  if (sequence === undefined || sequence !== read.value.sequence) {
    return { ok: false, code: 'changed-since-read' };
  }
  const ended = await correctTrackedBoxScore(
    context,
    { gameId, sequence, lines: [], end: true },
    deps,
  );
  if (ended.ok) return { ok: true };
  const { code } = ended.error;
  return code === 'changed-since-read' || code === 'tie-not-allowed'
    ? { ok: false, code }
    : { ok: false, code: 'gone' };
}
