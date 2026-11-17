// The parts of a round in the grid that say how many games it holds and whether it can be
// removed (steps 2.160 and 2.181), apart from the page so a test draws them from data. A
// round counts its games as the rule does: its placed games and its games with no date
// yet; a game in the bin does not count (S-60). "Remove this round" is offered only when
// the tap will succeed.
import type { ReactNode } from 'react';
import { t } from '../../server/messages.ts';
import { StaffPill } from '../staff/index.ts';
import { dayText, type GridRound } from './build-grid.ts';

/** Whether no game is in the round, placed or with no date yet: then it can be removed. */
export const roundIsEmpty = (round: GridRound): boolean =>
  round.games.length === 0 && round.undated === 0;

/** The round's day and how many games it holds, as one pill: "3 games, 1 of them with no date yet". */
export function RoundFacts({ round }: { readonly round: GridRound }) {
  const total = round.games.length + round.undated;
  return (
    <p className="admin-round-facts">
      <span>
        {round.date === null
          ? t('schedule.admin.roundNoDate')
          : t('schedule.admin.roundDate', { date: dayText(round.date) })}
      </span>{' '}
      <StaffPill>
        {round.undated === 0
          ? t.plural('schedule.admin.roundGames', total)
          : t.plural('schedule.admin.roundGamesUndated', total, { undated: round.undated })}
      </StaffPill>
    </p>
  );
}

/**
 * "Remove this round", apart from the round's two saves and looking like neither, when the
 * round is empty; otherwise one sentence saying why it cannot be removed. `fields` are the
 * form's hidden fields (the draft's basis and which round).
 */
export function RoundRemoval({
  round,
  action,
  fields,
}: {
  readonly round: GridRound;
  readonly action: (form: FormData) => Promise<never>;
  readonly fields: ReactNode;
}) {
  if (roundIsEmpty(round)) {
    return (
      <form action={action} data-remove-round={round.id} className="staff-form admin-round-remove">
        {fields}
        <p className="ui-field-help">{t('schedule.admin.removeRoundNote')}</p>
        <p className="staff-buttons">
          <button type="submit" className="ui-button" data-kind="danger">
            {t('schedule.admin.removeRound')}
          </button>
        </p>
      </form>
    );
  }
  return (
    <p className="ui-field-help admin-round-remove" data-remove-round-blocked={round.id}>
      {round.games.length > 0
        ? t.plural('schedule.admin.removeRoundBlocked', round.games.length)
        : t.plural('schedule.admin.removeRoundUndated', round.undated)}
    </p>
  );
}
