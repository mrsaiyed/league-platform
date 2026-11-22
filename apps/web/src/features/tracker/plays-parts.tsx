// The plays' parts of the scoring screen, as they are drawn (step 2.37; checklist I1 to
// I5 of the 2.107 audit; docs/build/DESIGN.md section 7). Each draws what it is given and
// holds no state: scoring-screen.tsx owns what is open and the taps, play-log.ts the
// rows and what Undo and Redo name, the message files the words.
//
// - Undo and Redo, after Start or Pause and the timeouts in the row under the scoreboard:
//   always on the screen, whatever the pad shows, so a wrong basket is taken back with a
//   player's options open; and at the far end of the pad's column from +1, +2 and +3.
//   Undo says on the button itself which play it takes back (I3: the standard said it in
//   a hint that needs a mouse).
// - The latest play, in the pad while nobody is picked: the play Undo takes back, with its
//   period and game clock, how many plays there are, and the way to all of them.
// - The play log: every play, newest first, each with its period and game clock and,
//   after a basket, the score; a play the league does not have yet is dimmed and says so
//   in words. It opens over the screen at every size, and has a panel of its own under
//   the pad where a tablet lying down has the room.
import type { Translate } from '@srleagues/site';
import type { MouseEvent } from 'react';
import type { NamedPlay, PlayLog, PlayRow } from './play-log.ts';

export type PlaysHandlers = {
  /** Undo tapped: takes the latest play back, or says why there is nothing to take back. */
  readonly undo: (event: MouseEvent<HTMLButtonElement>) => void;
  readonly redo: (event: MouseEvent<HTMLButtonElement>) => void;
  /** Opens the whole play log over the screen, or closes it. */
  readonly playLog: (open: boolean) => void;
};

export const playLogId = 'court-play-log';

/**
 * An arrow that turns back, drawn with one line: no icon font, no picture. Redo is the
 * same arrow turned the other way.
 */
function TurnMark({ forward = false }: { readonly forward?: boolean }) {
  return (
    <svg
      className="court-mark-turn"
      data-forward={forward ? '' : undefined}
      viewBox="0 0 20 20"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7.5 3.5 3 8l4.5 4.5M3.5 8h8a5 5 0 0 1 0 10H8" />
    </svg>
  );
}

/**
 * Undo and Redo (I1, I3). Undo names its play on the button: shortest where the row is
 * narrow ("+2 #5 Ned": what happened first, then the number, so a line cut short loses
 * the name), in the tracker's full words where there is room, and always in full for a
 * screen reader. With nothing to act on each is greyed, and still says why when tapped:
 * a hint that needs a mouse never would on a tablet.
 */
export function UndoRedo(props: {
  readonly t: Translate;
  readonly undo: NamedPlay | null;
  readonly redo: NamedPlay | null;
  readonly on: Pick<PlaysHandlers, 'undo' | 'redo'>;
}) {
  const { t, undo, redo, on } = props;
  return (
    <>
      <button
        type="button"
        className="court-turn"
        data-undo=""
        aria-disabled={undo === null ? true : undefined}
        aria-label={
          undo === null ? t('tracker.undo.nothing') : t('tracker.undo.label', { play: undo.text })
        }
        onClick={on.undo}
      >
        <span className="court-turn-head">
          <TurnMark />
          <span className="court-turn-word">{t('tracker.undo.button')}</span>
        </span>
        {undo === null ? null : (
          <span className="court-turn-play" data-undo-play="" aria-hidden="true">
            <span className="court-turn-short">{undo.short}</span>
            <span className="court-turn-full">{undo.text}</span>
          </span>
        )}
      </button>
      <button
        type="button"
        className="court-turn"
        data-redo=""
        aria-disabled={redo === null ? true : undefined}
        aria-label={
          redo === null ? t('tracker.redo.nothing') : t('tracker.redo.label', { play: redo.text })
        }
        onClick={on.redo}
      >
        <span className="court-turn-head">
          <TurnMark forward />
          <span className="court-turn-word">{t('tracker.redo.button')}</span>
        </span>
      </button>
    </>
  );
}

/** "42 plays", and how many of them the league does not have yet. */
function countText(log: Pick<PlayLog, 'count' | 'unsent'>, t: Translate): string {
  const count = t.plural('tracker.log.count', log.count);
  return log.unsent === 0
    ? count
    : [count, t.plural('tracker.log.unsent', log.unsent)].join(t('tracker.queue.separator'));
}

/** One line of the log: when, what, and after a basket the score. */
function Row({ t, row }: { readonly t: Translate; readonly row: PlayRow }) {
  return (
    <li className="court-logged" data-play={row.id} data-unsent={row.unsent ? '' : undefined}>
      <span className="court-logged-when">{row.when}</span>
      <span className="court-logged-what">
        <span className="court-logged-text">{row.text}</span>
        {/* Dimmed, and said in words: a color never carries a meaning alone. */}
        {row.unsent ? (
          <span className="court-logged-unsent">{t('tracker.log.notSent')}</span>
        ) : null}
      </span>
      {row.score === null ? null : <span className="court-logged-score">{row.score}</span>}
    </li>
  );
}

/**
 * The latest plays in the pad at rest (I4, I5): one button, at least 44 high, that names
 * the latest play (the one Undo takes back) and opens the whole log. Where the pad has
 * room for more (a tablet upright), the plays before it are listed under it.
 */
export function LatestPlays(props: {
  readonly t: Translate;
  /** The newest few rows, the latest first; never empty here. */
  readonly log: PlayLog;
  readonly open: boolean;
  readonly on: Pick<PlaysHandlers, 'playLog'>;
}) {
  const { t, log, on } = props;
  const [latest, ...before] = log.rows;
  if (latest === undefined) return null;
  return (
    <div className="court-latest" data-latest="">
      <button
        type="button"
        className="court-latest-button"
        data-log-open=""
        aria-haspopup="dialog"
        aria-expanded={props.open}
        aria-controls={playLogId}
        data-unsent={latest.unsent ? '' : undefined}
        onClick={() => on.playLog(true)}
      >
        {/* Its first line: "Latest", the period and the game clock, and at its end how
            many plays there are. While the league does not have the play yet, "Not sent
            yet" stands where "Latest" stood, in the amber of plays that wait, and the
            play under it is dimmed: said in words, never by the color alone, and in a
            line that is whole in a phone's narrowest pad. */}
        <span className="court-latest-head">
          {latest.unsent ? (
            <span className="court-logged-unsent">{t('tracker.log.notSent')}</span>
          ) : (
            <span className="court-label">{t('tracker.log.latest')}</span>
          )}
          <span className="court-latest-when">{latest.when}</span>
          <span className="court-latest-count" aria-hidden="true">
            {t.plural('tracker.log.count', log.count)}
            <span className="court-caret" />
          </span>
        </span>
        <span className="court-latest-play" data-latest-play="">
          {latest.text}
        </span>
        {/* What the button does, for a screen reader, after the play it has just read. */}
        <span className="court-sr">{t('tracker.log.open', { count: countText(log, t) })}</span>
      </button>
      {before.length === 0 ? null : (
        <ul className="court-latest-before" aria-hidden="true">
          {before.map((row) => (
            <Row key={row.id} t={t} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The play log where it has a panel of its own (a tablet lying down): the newest plays,
 * in a box that scrolls by itself, under a line that counts them all. A long game's
 * earlier plays are one tap away, in the whole log.
 */
export function PlayLogPanel(props: {
  readonly t: Translate;
  readonly log: PlayLog;
  readonly on: Pick<PlaysHandlers, 'playLog'>;
}) {
  const { t, log, on } = props;
  return (
    <div className="court-log-panel" data-log-panel="">
      <h2 className="court-log-title">
        <span className="court-label">{t('tracker.log.title')}</span>
        <span className="court-log-count" data-log-count="">
          {log.count === 0 ? null : countText(log, t)}
        </span>
      </h2>
      {log.rows.length === 0 ? (
        <p className="court-quiet">{t('tracker.log.empty')}</p>
      ) : (
        <ul className="court-log-rows" tabIndex={0} aria-label={t('tracker.log.title')}>
          {log.rows.map((row) => (
            <Row key={row.id} t={t} row={row} />
          ))}
        </ul>
      )}
      {log.rows.length < log.count ? (
        <button
          type="button"
          className="court-button court-log-whole"
          data-log-whole=""
          onClick={() => on.playLog(true)}
        >
          {t('tracker.log.whole', { count: log.count })}
        </button>
      ) : null}
    </div>
  );
}

/**
 * The way to the play log behind More: there whatever the pad shows, and once the game
 * is final, when the pad no longer holds the latest play's line.
 */
export function MoreLog(props: {
  readonly t: Translate;
  readonly log: Pick<PlayLog, 'count' | 'unsent'>;
  readonly on: Pick<PlaysHandlers, 'playLog'>;
}) {
  const { t, log, on } = props;
  return (
    <div className="court-sheet-item">
      <button
        type="button"
        className="court-button"
        data-more-log=""
        onClick={() => on.playLog(true)}
      >
        {t('tracker.log.title')}
      </button>
      <p className="court-quiet">{log.count === 0 ? t('tracker.log.empty') : countText(log, t)}</p>
    </div>
  );
}

/**
 * The whole play log, opened over the screen as More is (I4): on a phone the pad is too
 * low to read a game's plays in, and the log must take no room from the two fives. ×
 * and Escape close it; the list scrolls inside it and its title stays.
 */
export function PlayLogSheet(props: {
  readonly t: Translate;
  /** Every play. */
  readonly log: PlayLog;
  readonly on: Pick<PlaysHandlers, 'playLog'>;
}) {
  const { t, log, on } = props;
  return (
    <div className="court-sheet-wrap" data-play-log="">
      <div className="court-scrim" onClick={() => on.playLog(false)} />
      <div
        className="court-sheet court-log-sheet"
        id={playLogId}
        role="dialog"
        aria-modal="true"
        aria-labelledby="court-log-title"
      >
        <div className="court-sheet-head">
          <h2 id="court-log-title">
            {t('tracker.log.title')}
            <span className="court-log-count" data-log-count="">
              {log.count === 0 ? null : countText(log, t)}
            </span>
          </h2>
          <button
            type="button"
            className="court-close"
            aria-label={t('tracker.log.close')}
            onClick={() => on.playLog(false)}
          >
            <span className="court-cross" aria-hidden="true" />
          </button>
        </div>
        {log.rows.length === 0 ? (
          <p className="court-quiet">{t('tracker.log.empty')}</p>
        ) : (
          <ul className="court-log-rows" tabIndex={0} aria-label={t('tracker.log.title')}>
            {log.rows.map((row) => (
              <Row key={row.id} t={t} row={row} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
