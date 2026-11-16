// The clock's parts of the scoring screen, as they are drawn (step 2.36; checklist D8, F1
// to F5, G3 to G7 and T2 to T11 of the 2.107 audit; docs/build/DESIGN.md section 7). Each
// draws what it is given and holds no state: scoring-screen.tsx owns what is open and
// the taps, game-clock.ts and scoring-view.ts the numbers, the message files the words.
//
// - The clock itself, in the scoreboard: tapped, it opens the form that sets it and
//   picks the period.
// - Start and Pause under the scoreboard: different in word and in shape (a triangle, two
//   bars), never only in color. Beside them the one way to both teams' timeouts.
// - Team fouls and the bonus, in each team's box of the scoreboard: a team's heading has
//   no room for them on a phone.
// - The large Start clock button, in the pad while nobody is picked: where the thumbs
//   are, saying why the clock is stopped. It lies in the band of the pad where a picked
//   player's name is shown, never where +1, +2, +3, Foul or a substitute lie: the pad
//   returns to rest with each of those taps, and a second fast tap must not start the clock.
// - Both teams' timeouts, in the pad: left by length, the question before one too many,
//   those taken and taking the latest back.
import type { Translate } from '@srleagues/site';
import { basketball } from '@srleagues/sports';
import type { MouseEvent } from 'react';
import { periodText } from './engine-words.ts';
import type { ClockEntry, PeriodChoice } from './game-clock.ts';
import type { TimeoutCall } from './scoring-moves.ts';
import type { ScoringView, Side, TeamPanel } from './scoring-view.ts';

/** The clock as the screen draws it. The ticker repaints the time between drawings. */
export type CourtClock = {
  /** "7:58", as it read when the screen was drawn. */
  readonly text: string;
  readonly running: boolean;
  /** At 0:00: the next period is picked before the clock starts again. */
  readonly over: boolean;
  /**
   * The large Start clock button in the pad at rest (T7 to T10), with why the clock is
   * stopped; null while it is not offered.
   */
  readonly start: { readonly tipOff: boolean; readonly why: string } | null;
};

/** The form that sets the clock and picks the period, while it is open. */
export type ClockSheet = {
  /** What is typed on its keys so far, and what that means. */
  readonly entry: ClockEntry;
  /** "0:30" when the time typed puts that much back on the clock; null when it does not. */
  readonly putsBack: string | null;
  readonly periods: readonly PeriodChoice[];
};

export type ClockHandlers = {
  readonly startClock: (event: MouseEvent<HTMLButtonElement>) => void;
  readonly pauseClock: (event: MouseEvent<HTMLButtonElement>) => void;
  /** Start tapped at 0:00: the screen says why it does nothing. */
  readonly periodOver: () => void;
  /** × on the large Start clock button: hidden until the clock next stops. */
  readonly hideStart: (event: MouseEvent<HTMLButtonElement>) => void;
  readonly clockSheet: (open: boolean) => void;
  /** A key of the clock's form: a digit, `back` or `clear`. */
  readonly clockKey: (key: string) => void;
  readonly setClock: () => void;
  readonly pickPeriod: (period: number) => void;
  /** Opens both teams' timeouts in the pad, or closes them. */
  readonly timeouts: () => void;
  readonly callTimeout: (call: TimeoutCall, event: MouseEvent<HTMLButtonElement>) => void;
  /** The answer to "Record it anyway?". */
  readonly answerTimeout: (record: boolean, event: MouseEvent<HTMLButtonElement>) => void;
  readonly takeBackTimeout: (side: Side) => void;
};

const sides = basketball.SIDES;
export const clockSheetId = 'court-clock-sheet';

const period = (view: ScoringView, t: Translate, number = view.period): string =>
  periodText(number, view.periods, t);

/** What a team's scoreboard box says to a screen reader: the score, its fouls, its bonus. */
export function teamBoardLabel(team: TeamPanel, t: Translate): string {
  const values = {
    team: team.name,
    score: team.score,
    fouls: t.plural('tracker.fouls.thisPeriod', team.teamFouls),
  };
  return team.bonus === 0
    ? t('tracker.court.teamBoard', values)
    : t('tracker.court.teamBoardBonus', { ...values, bonus: t(`tracker.bonus.${team.bonus}`) });
}

/**
 * A team's fouls this period and, when the other team's fouls have put it there, its
 * bonus (F1 to F3). The count is always there, so nothing moves when the first foul is
 * given; it grows and turns red at the bonus, and again at the double bonus. The badge
 * sits with the team that SHOOTS the bonus, and says which in words. Where the box is
 * narrow (an upright phone) and holds a badge too, the count is written as the tiles
 * write a player's fouls ("10F"), so "Double bonus" is never cut.
 */
export function TeamFouls({ t, team }: { readonly t: Translate; readonly team: TeamPanel }) {
  return (
    <span
      className="court-score-fouls"
      aria-hidden="true"
      data-badge={team.bonus === 0 ? undefined : ''}
    >
      <span className="court-fouls-count" data-team-fouls={team.side} data-level={team.foulLevel}>
        <span className="court-fouls-words">{t.plural('tracker.fouls.count', team.teamFouls)}</span>
        {team.bonus === 0 ? null : (
          <span className="court-fouls-short">
            {t('tracker.tile.fouls', { count: team.teamFouls })}
          </span>
        )}
      </span>
      {team.bonus === 0 ? null : (
        <span className="court-bonus" data-bonus={team.side} data-level={team.bonus}>
          {t(`tracker.bonus.${team.bonus}`)}
        </span>
      )}
    </span>
  );
}

/** The clock in the scoreboard: the time, the period, and the way to set both (T5, T6). */
export function ClockButton(props: {
  readonly t: Translate;
  readonly view: ScoringView;
  readonly clock: CourtClock;
  readonly open: boolean;
  readonly on: Pick<ClockHandlers, 'clockSheet'>;
}) {
  const { t, view, clock } = props;
  return (
    <button
      type="button"
      className="court-clock"
      data-clock=""
      data-zero={clock.over ? '' : undefined}
      data-running={clock.running ? '' : undefined}
      aria-haspopup="dialog"
      aria-expanded={props.open}
      aria-controls={clockSheetId}
      disabled={view.status === 'final'}
      onClick={() => props.on.clockSheet(true)}
    >
      <span className="court-clock-time" data-clock-time="">
        {clock.text}
      </span>
      <span className="court-clock-period" data-period={view.period}>
        {period(view, t)}
        <span className="court-caret" aria-hidden="true" />
      </span>
      <span className="court-sr">{t('tracker.clock.set')}</span>
    </button>
  );
}

/** Start or Pause, and the way to the timeouts: the row under the scoreboard (T2, G3). */
export function ClockControls(props: {
  readonly t: Translate;
  readonly view: ScoringView;
  readonly clock: CourtClock;
  readonly timeoutsOpen: boolean;
  readonly padId: string;
  readonly on: Pick<ClockHandlers, 'startClock' | 'pauseClock' | 'periodOver' | 'timeouts'>;
}) {
  const { t, view, clock, on } = props;
  const final = view.status === 'final';
  const state = clock.running ? 'pause' : clock.over ? 'over' : 'start';
  return (
    <>
      <button
        type="button"
        className="court-go"
        data-clock-toggle=""
        data-state={state}
        // Greyed at 0:00, and still tappable: a tap says why (I6), which a hint that
        // needs a mouse never would on a tablet.
        aria-disabled={state === 'over' || final ? true : undefined}
        disabled={final}
        aria-label={t(`tracker.clock.${state}Label`)}
        onClick={
          state === 'pause' ? on.pauseClock : state === 'over' ? on.periodOver : on.startClock
        }
      >
        <span
          className={state === 'pause' ? 'court-mark-pause' : 'court-mark-start'}
          aria-hidden="true"
        />
        <span className="court-go-word">{t(`tracker.clock.${state}`)}</span>
      </button>
      <button
        type="button"
        className="court-timeouts-button"
        data-timeouts-open=""
        aria-expanded={props.timeoutsOpen}
        aria-controls={props.padId}
        disabled={final}
        onClick={on.timeouts}
      >
        {t('tracker.timeouts.title')}
        <span className="court-caret" aria-hidden="true" />
      </button>
    </>
  );
}

/**
 * A team's timeouts left, beside its name where there is room: a tablet (G3). Written
 * short, as the bench's chip is ("Timeouts 2"), so the team's name keeps its place; a
 * screen reader is told in full.
 */
export function TimeoutsChip(props: {
  readonly t: Translate;
  readonly team: TeamPanel;
  readonly open: boolean;
  readonly padId: string;
  readonly disabled: boolean;
  readonly on: Pick<ClockHandlers, 'timeouts'>;
}) {
  const { t, team } = props;
  return (
    <button
      type="button"
      className="court-chip court-timeouts-chip"
      data-timeouts-chip={team.side}
      data-none={team.timeouts.left === 0 ? '' : undefined}
      aria-expanded={props.open}
      aria-controls={props.padId}
      disabled={props.disabled}
      aria-label={
        team.timeouts.left === 0
          ? t('tracker.timeouts.chipNone', { team: team.name })
          : t.plural('tracker.timeouts.chipLabel', team.timeouts.left, { team: team.name })
      }
      onClick={props.on.timeouts}
    >
      {t('tracker.timeouts.chip', { count: team.timeouts.left })}
      <span className="court-caret" aria-hidden="true" />
    </button>
  );
}

/**
 * The pad's first line while nobody is picked: the large Start clock button with why the
 * clock is stopped (T7 to T10), or at 0:00 the way to the next period (T2, T4).
 */
export function StartBar(props: {
  readonly t: Translate;
  readonly view: ScoringView;
  readonly clock: CourtClock;
  readonly on: Pick<ClockHandlers, 'startClock' | 'hideStart' | 'clockSheet'>;
}) {
  const { t, view, clock, on } = props;
  if (view.status === 'final') return null;
  if (clock.over) {
    return (
      <div className="court-start" data-period-over="">
        <div className="court-start-row">
          <button
            type="button"
            className="court-start-button"
            data-kind="next"
            data-pick-period=""
            aria-describedby="court-start-why"
            onClick={() => on.clockSheet(true)}
          >
            <span className="court-start-title">{t('tracker.over.pick')}</span>
          </button>
        </div>
        <p className="court-start-why" id="court-start-why">
          {t(view.period === view.periods / 2 ? 'tracker.over.halftime' : 'tracker.over.period', {
            period: period(view, t),
          })}
        </p>
      </div>
    );
  }
  if (clock.start === null) return null;
  return (
    <div className="court-start" data-start-bar="">
      <div className="court-start-row">
        <button
          type="button"
          className="court-start-button"
          data-start-clock=""
          aria-describedby="court-start-why"
          onClick={on.startClock}
        >
          <span className="court-mark-start" aria-hidden="true" />
          <span className="court-start-title">
            {t(clock.start.tipOff ? 'tracker.start.tipOff' : 'tracker.start.title')}
          </span>
          <span className="court-start-when">
            {t('tracker.start.when', { period: period(view, t), clock: clock.text })}
          </span>
        </button>
        <button
          type="button"
          className="court-close"
          data-hide-start=""
          aria-label={t('tracker.start.hide')}
          onClick={on.hideStart}
        >
          <span className="court-cross" aria-hidden="true" />
        </button>
      </div>
      <p className="court-start-why" id="court-start-why">
        <span data-stop-reason="">{clock.start.why}</span> {t('tracker.start.still')}
      </p>
    </div>
  );
}

/** "2 full a half · 1 more each overtime · none carried over": the rule in one line (G7). */
export function timeoutRuleText(rules: basketball.TimeoutRules, t: Translate): string {
  const per = rules.timeoutsPer;
  const allowed =
    rules.fullTimeouts > 0 && rules.shortTimeouts > 0
      ? t(`tracker.timeouts.rule.both.${per}`, {
          full: rules.fullTimeouts,
          short: rules.shortTimeouts,
        })
      : rules.fullTimeouts > 0
        ? t(`tracker.timeouts.rule.full.${per}`, { count: rules.fullTimeouts })
        : rules.shortTimeouts > 0
          ? t(`tracker.timeouts.rule.short.${per}`, { count: rules.shortTimeouts })
          : t(`tracker.timeouts.rule.none.${per}`);
  return [
    allowed,
    rules.overtimeTimeouts > 0
      ? t('tracker.timeouts.rule.overtime', { count: rules.overtimeTimeouts })
      : t('tracker.timeouts.rule.noOvertime'),
    t(rules.timeoutsCarry ? 'tracker.timeouts.rule.carry' : 'tracker.timeouts.rule.noCarry'),
  ].join(t('tracker.queue.separator'));
}

const leftText = (count: number, t: Translate): string =>
  count > 0 ? t.plural('tracker.timeouts.left', count) : t('tracker.timeouts.noneLeft');

/**
 * Both teams' timeouts, in the pad (G4 to G7): a button for each length saying how many
 * are left, those taken with their period and clock time, and − to take the latest back.
 * A team with none of a length left is asked about first, in the pad's lowest band, away
 * from the buttons that were just tapped.
 */
export function TimeoutsPad(props: {
  readonly t: Translate;
  readonly view: ScoringView;
  readonly asking: TimeoutCall | null;
  readonly on: Pick<ClockHandlers, 'callTimeout' | 'answerTimeout' | 'takeBackTimeout'> & {
    readonly closePad: () => void;
  };
}) {
  const { t, view, asking, on } = props;
  return (
    <div
      className="court-options court-timeouts"
      role="group"
      aria-label={t('tracker.timeouts.title')}
      data-timeout-list=""
    >
      <div className="court-who">
        {/* The title and the rule run on as one line of words that may wrap: the rule is
            read whole, never cut, however narrow the pad. */}
        <p className="court-timeout-head">
          <span className="court-timeout-title">{t('tracker.timeouts.title')}</span>{' '}
          <span className="court-timeout-rule" data-timeout-rule="">
            {timeoutRuleText(view.timeoutRules, t)}
          </span>
        </p>
        <button
          type="button"
          className="court-close"
          aria-label={t('tracker.pad.closeOptions')}
          onClick={on.closePad}
        >
          <span className="court-cross" aria-hidden="true" />
        </button>
      </div>
      {asking !== null ? (
        <div className="court-timeout-ask" role="group" data-timeout-ask={asking.side}>
          <p id="court-timeout-question">
            {t(asking.seconds === 30 ? 'tracker.timeouts.ask.short' : 'tracker.timeouts.ask.full', {
              team: view.teams[asking.side].name,
            })}
          </p>
          <div className="court-timeout-answers">
            <button
              type="button"
              className="court-opt"
              data-answer="no"
              aria-describedby="court-timeout-question"
              onClick={(event) => on.answerTimeout(false, event)}
            >
              {t('tracker.timeouts.ask.no')}
            </button>
            <button
              type="button"
              className="court-opt court-opt-timeout"
              data-answer="yes"
              aria-describedby="court-timeout-question"
              onClick={(event) => on.answerTimeout(true, event)}
            >
              {t('tracker.timeouts.ask.yes')}
            </button>
          </div>
        </div>
      ) : (
        <div className="court-timeout-teams">
          {sides.map((side) => (
            <TeamTimeouts key={side} t={t} view={view} team={view.teams[side]} on={on} />
          ))}
        </div>
      )}
    </div>
  );
}

function TeamTimeouts(props: {
  readonly t: Translate;
  readonly view: ScoringView;
  readonly team: TeamPanel;
  readonly on: Pick<ClockHandlers, 'callTimeout' | 'takeBackTimeout'>;
}) {
  const { t, view, team, on } = props;
  const { timeouts } = team;
  const final = view.status === 'final';
  const call = (seconds: 60 | 30) => {
    const left = seconds === 30 ? timeouts.short : timeouts.full;
    const length = seconds === 30 ? 'short' : 'full';
    return (
      <button
        type="button"
        className="court-opt court-opt-timeout"
        data-act="timeout"
        data-side={team.side}
        data-seconds={seconds}
        data-none={left === 0 ? '' : undefined}
        disabled={final}
        aria-label={t(`tracker.timeouts.call.${length}`, {
          team: team.name,
          left: leftText(left, t),
        })}
        onClick={(event) => on.callTimeout({ side: team.side, seconds }, event)}
      >
        <span className="court-opt-word">{t(`tracker.timeouts.${length}`)}</span>
        <span className="court-opt-small">{leftText(left, t)}</span>
      </button>
    );
  };
  // The latest first: it is the one − takes back.
  const taken = [...timeouts.taken].reverse();
  return (
    <section
      className="court-timeout-team"
      data-color={team.color}
      data-timeouts-of={team.side}
      aria-label={t('tracker.timeouts.of', { team: team.name })}
    >
      <p className="court-timeout-name">
        <span className="court-swatch" aria-hidden="true" />
        <span className="court-team-name-text">{team.name}</span>
      </p>
      <div className="court-timeout-calls">
        {call(60)}
        {timeouts.offersShort ? call(30) : null}
      </div>
      <div className="court-timeout-taken">
        {taken.length === 0 ? (
          <p className="court-quiet">{t('tracker.timeouts.noneTaken')}</p>
        ) : (
          <>
            <ul data-timeouts-taken={team.side}>
              {taken.map((timeout) => (
                <li key={timeout.id}>
                  {t(
                    timeout.seconds === 30
                      ? 'tracker.timeouts.taken.short'
                      : 'tracker.timeouts.taken.full',
                    {
                      period: periodText(timeout.period, view.periods, t),
                      clock: basketball.formatClock(timeout.clockMs),
                    },
                  )}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="court-opt court-opt-minus"
              data-act="untimeout"
              data-side={team.side}
              disabled={final}
              aria-label={t('tracker.timeouts.takeBack', { team: team.name })}
              onClick={() => on.takeBackTimeout(team.side)}
            >
              <span className="court-minus" aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </section>
  );
}

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'] as const;

/**
 * The form that sets the clock and picks the period (T5, T6): large number keys in place
 * of the browser's own box, the time filling from the right as on a scoreboard's
 * controller, and what setting it will do said before it is done. Picking a period acts
 * at once; × and Escape close it with nothing changed.
 */
export function ClockSheetView(props: {
  readonly t: Translate;
  readonly view: ScoringView;
  readonly clock: CourtClock;
  readonly sheet: ClockSheet;
  readonly on: Pick<ClockHandlers, 'clockSheet' | 'clockKey' | 'setClock' | 'pickPeriod'>;
}) {
  const { t, view, clock, sheet, on } = props;
  const { entry } = sheet;
  const typed = entry.problem !== 'empty';
  const note =
    entry.problem === 'seconds'
      ? t('tracker.clockSheet.seconds')
      : entry.problem === 'range'
        ? t('tracker.clockSheet.range')
        : sheet.putsBack !== null
          ? t('tracker.clockSheet.putsBack', { back: sheet.putsBack })
          : t(clock.running ? 'tracker.clockSheet.stops' : 'tracker.clockSheet.keysHelp');
  return (
    <div className="court-sheet-wrap" data-clock-sheet="">
      <div className="court-scrim" onClick={() => on.clockSheet(false)} />
      <div
        className="court-sheet court-clock-sheet"
        id={clockSheetId}
        role="dialog"
        aria-modal="true"
        aria-labelledby="court-clock-title"
      >
        <div className="court-sheet-head">
          <h2 id="court-clock-title">{t('tracker.clockSheet.title')}</h2>
          <button
            type="button"
            className="court-close"
            aria-label={t('tracker.court.close')}
            onClick={() => on.clockSheet(false)}
          >
            <span className="court-cross" aria-hidden="true" />
          </button>
        </div>
        <div className="court-clock-parts">
          <section
            className="court-clock-part"
            data-part="period"
            aria-labelledby="court-period-title"
          >
            <h3 className="court-label" id="court-period-title">
              {t('tracker.clockSheet.period')}
            </h3>
            <div className="court-period-row" data-periods="">
              {sheet.periods.map((choice) => {
                const name = period(view, t, choice.period);
                return (
                  <button
                    key={choice.period}
                    type="button"
                    className="court-opt court-opt-period"
                    data-period-pick={choice.period}
                    // The period after this one is marked; once this one is over it is
                    // the next step, and filled.
                    data-next={choice.next ? (clock.over ? 'due' : 'later') : undefined}
                    aria-pressed={choice.current}
                    disabled={choice.current}
                    aria-label={t(
                      choice.current
                        ? 'tracker.clockSheet.periodNow'
                        : 'tracker.clockSheet.periodGo',
                      { period: name },
                    )}
                    onClick={() => on.pickPeriod(choice.period)}
                  >
                    <span className="court-opt-word">{name}</span>
                    {choice.current ? (
                      <span className="court-opt-small">{t('tracker.clockSheet.now')}</span>
                    ) : choice.next ? (
                      <span className="court-opt-small">{t('tracker.clockSheet.next')}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <p className="court-quiet court-clock-help">{t('tracker.clockSheet.periodHelp')}</p>
          </section>
          <section className="court-clock-part" data-part="time" aria-labelledby="court-time-title">
            <h3 className="court-label" id="court-time-title">
              {t('tracker.clockSheet.time')}
            </h3>
            <output
              className="court-clock-entry"
              data-clock-entry=""
              data-typed={typed ? '' : undefined}
              data-problem={entry.ms === null && typed ? '' : undefined}
              aria-live="polite"
            >
              {typed ? entry.text : clock.text}
            </output>
            <p className="court-clock-note" role="status" data-clock-note="">
              {note}
            </p>
          </section>
          <div className="court-keys" role="group" aria-label={t('tracker.clockSheet.keys')}>
            {keys.map((key) => (
              <button
                key={key}
                type="button"
                className="court-opt court-key"
                data-key={key}
                aria-label={
                  key === 'clear'
                    ? t('tracker.clockSheet.clearLabel')
                    : key === 'back'
                      ? t('tracker.clockSheet.backLabel')
                      : undefined
                }
                onClick={() => on.clockKey(key)}
              >
                {key === 'clear' ? (
                  t('tracker.clockSheet.clear')
                ) : key === 'back' ? (
                  <span className="court-mark-back" aria-hidden="true" />
                ) : (
                  key
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="court-button court-clock-set"
            data-kind="main"
            data-set-clock=""
            disabled={entry.ms === null}
            onClick={on.setClock}
          >
            {entry.ms === null
              ? t('tracker.clockSheet.set')
              : t('tracker.clockSheet.setTo', { clock: entry.text })}
          </button>
        </div>
      </div>
    </div>
  );
}
