// What the games list says when "Needs a result" or "Earlier games" is empty (step 2.156).
// Someone who scores every game of the league is told of the whole league; someone who
// scores only some (a program, or the games assigned to them) only of theirs, as nothing
// they are shown can say more. The words are in the message files (T-187).
import { t } from '../../server/messages.ts';

/** The words for an empty "Needs a result". */
export function needsResultEmptyText(seesEveryGame: boolean): string {
  return seesEveryGame
    ? t('admin.games.needsResult.empty')
    : t('admin.games.needsResult.emptyYours');
}

/** The words for "Earlier games" with no round to offer. */
export function earlierEmptyText(seesEveryGame: boolean): string {
  return seesEveryGame ? t('admin.games.earlier.empty') : t('admin.games.earlier.emptyYours');
}
