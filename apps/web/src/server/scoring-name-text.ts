// The name a scoring screen shows a player by (R-33, T-483): the scoring screens' rule
// (core's `scoringNames`, which the games store applies) gives each player the name the
// rule allows and, for one the number and name do not tell apart, a place on the team's
// roster. The server words that place here, from the message files, into the name
// itself ("Player 1", "Sam L. (player 2)"), so the scorer's rosters keep the shape they
// had before step 2.226 and a page opened before it still reads them.
import { t } from './messages.ts';

type Named = {
  readonly firstName: string;
  readonly lastName: string;
  /** The place among those the number and name do not tell apart, or null (R-33). */
  readonly ordinal: number | null;
};

/** The two name fields as the screens show them, the place worded in when there is one. */
export function scoringNameText(player: Named): { firstName: string; lastName: string } {
  if (player.ordinal === null) return { firstName: player.firstName, lastName: player.lastName };
  const name =
    player.firstName !== '' && player.lastName !== ''
      ? t('tracker.player.fullName', { first: player.firstName, last: player.lastName })
      : player.firstName !== ''
        ? player.firstName
        : player.lastName;
  const place = player.ordinal;
  return {
    firstName:
      name === ''
        ? t('tracker.player.place', { place })
        : t('tracker.player.namePlace', { name, place }),
    lastName: '',
  };
}
