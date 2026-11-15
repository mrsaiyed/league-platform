// Under a final or forfeited game (step 2.154): "Correct this result", leading to the
// game's reopen form, for whoever may reopen it; who can, for everyone else. Words from
// the message files (T-187); the address from the one address helper (T-34).
import { clockTimeText, type LeagueTimes } from '../../server/game-when.ts';
import { t } from '../../server/messages.ts';
import type { ReopenView } from './reopen-view.ts';

export function ReopenLine({
  view,
  href,
  times,
}: {
  readonly view: ReopenView | undefined;
  /** The game's reopen form: its page in the games area. */
  readonly href: string;
  readonly times: LeagueTimes;
}) {
  if (view === undefined || view.kind === 'none') return null;
  if (view.kind === 'who') {
    return <p data-reopen="who">{t(`admin.games.reopenWho.${view.because}`)}</p>;
  }
  return (
    <p data-reopen="correct">
      {view.until === null ? null : (
        <>{t('admin.games.reopenUntil', { time: clockTimeText(view.until, times) })} </>
      )}
      <a className="ui-button" href={href}>
        {t('admin.games.correct')}
      </a>
    </p>
  );
}
