// The box score grid's notice after a change (step 2.64), as message keys (T-187):
// what was done, or why it was refused.
import type { TextKey } from '../../server/messages.ts';
import { isBoxScoreAction } from './run-box-score-action.ts';

type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;

const problemKeys: readonly TextKey[] = [
  'admin.boxScore.error.invalid-input',
  'admin.boxScore.error.reopen-reason',
  'admin.boxScore.error.game-is-tracked',
  'admin.boxScore.error.player-not-on-team',
  'admin.boxScore.error.player-listed-twice',
  'admin.boxScore.error.did-not-play-has-stats',
  'admin.boxScore.error.game-not-decided',
];
const gamesProblemKeys: readonly TextKey[] = [
  'admin.games.error.not-allowed',
  'admin.games.error.game-not-found',
  'admin.games.error.changed-since-read',
  'admin.games.error.game-already-decided',
  'admin.games.error.game-cancelled',
  'admin.games.error.tie-not-allowed',
  'admin.games.error.team-not-in-game',
];

/** The notice after a change, as words: what was done, or why it was refused. */
export function boxScoreNotice(
  search: SearchParams,
): { key: TextKey; problem: boolean } | undefined {
  const done = first(search['done']);
  if (isBoxScoreAction(done)) return { key: `admin.boxScore.done.${done}`, problem: false };
  const problem = first(search['problem']);
  if (problem === undefined) return undefined;
  const key =
    problemKeys.find((k) => k === `admin.boxScore.error.${problem}`) ??
    gamesProblemKeys.find((k) => k === `admin.games.error.${problem}`) ??
    'admin.games.error.unknown';
  return { key, problem: true };
}
