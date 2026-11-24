// Why a change in the games area was refused, as message keys (T-187): the command's
// error code where the games list or the box score grid knows it, else "that did not work".
import type { TextKey } from '../../server/messages.ts';

const gamesKeys: readonly TextKey[] = [
  'admin.games.error.not-allowed',
  'admin.games.error.invalid-input',
  'admin.games.error.game-not-found',
  'admin.games.error.changed-since-read',
  'admin.games.error.game-already-decided',
  'admin.games.error.game-cancelled',
  'admin.games.error.tie-not-allowed',
  'admin.games.error.team-not-in-game',
  'admin.games.error.game-is-tracked',
  'admin.games.error.game-not-postponable',
  'admin.games.error.game-not-cancellable',
  'admin.games.error.game-postponed',
  'admin.games.error.game-not-called-off',
  'admin.games.error.game-now-cancelled',
  'admin.games.error.game-now-postponed',
  'admin.games.error.game-part-in-bin',
  'admin.games.error.choose-team',
  'admin.games.error.choose-reason',
];

const boxScoreKeys: readonly TextKey[] = [
  'admin.boxScore.error.invalid-input',
  'admin.boxScore.error.reopen-reason',
  'admin.boxScore.error.game-is-tracked',
  'admin.boxScore.error.player-not-on-team',
  'admin.boxScore.error.player-listed-twice',
  'admin.boxScore.error.did-not-play-has-stats',
  'admin.boxScore.error.game-not-decided',
  'admin.boxScore.error.reopen-time-over',
  'admin.boxScore.error.result-overturned',
  'admin.boxScore.error.not-recorded-by-you',
  'admin.boxScore.error.not-recorded-by-hand',
  'admin.boxScore.error.scorekeepers-may-not-reopen',
];

// A put back of the sheet refused (step 2.229, T-366), in plain words.
const putBackKeys: readonly TextKey[] = [
  'admin.boxScore.putBackError.game-not-decided',
  'admin.boxScore.putBackError.newer-save',
  'admin.boxScore.putBackError.no-sheet-kept',
  'admin.boxScore.putBackError.player-gone',
  'admin.boxScore.putBackError.scored-live',
  'admin.boxScore.putBackError.put-back-reason',
];

/** A refusal on the games list, as words. */
export function gamesProblemKey(code: string): TextKey {
  return gamesKeys.find((k) => k === `admin.games.error.${code}`) ?? 'admin.games.error.unknown';
}

/** A refusal on the box score grid: its own words first, else the games list's. */
export function boxScoreProblemKey(code: string): TextKey {
  return (
    boxScoreKeys.find((k) => k === `admin.boxScore.error.${code}`) ??
    gamesKeys.find((k) => k === `admin.games.error.${code}` && code !== 'invalid-input') ??
    'admin.games.error.unknown'
  );
}

/** The words for a put back of the sheet refused (step 2.229), else the box score's own. */
export function putBackProblemKey(code: string): TextKey {
  return (
    putBackKeys.find((k) => k === `admin.boxScore.putBackError.${code}`) ?? boxScoreProblemKey(code)
  );
}
