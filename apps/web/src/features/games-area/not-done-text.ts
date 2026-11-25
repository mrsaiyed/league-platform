// A change not made because the game was called off meanwhile (step 2.221): left as a
// one-time notice and said beside the game, as "Saved" is (actions.ts `act`). It names the
// game as every refusal of the games area does ("Tigers at Lions: …", step 2.155 part 5),
// so it says which game even when it stands at the top of the list (the game not on it).
import { t, type TextKey } from '../../server/messages.ts';

const notDoneKeys: readonly TextKey[] = [
  'admin.games.error.game-now-cancelled',
  'admin.games.error.game-now-postponed',
];

/** The message of a notice that says a change was not made, if `said` is one. */
export const notDoneOf = (said: string): TextKey | undefined =>
  notDoneKeys.find((k) => k === `admin.games.error.${said}`);

/** Its sentence, naming the game ("Tigers at Lions"); undefined for any other notice. */
export function notDoneText(said: string, game: string | undefined): string | undefined {
  const key = notDoneOf(said);
  if (key === undefined) return undefined;
  return game === undefined ? t(key) : t('admin.games.refusedAbout', { game, problem: t(key) });
}
