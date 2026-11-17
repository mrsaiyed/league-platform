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
import { Fragment, type MouseEvent } from 'react';
import { periodText } from './engine-words.ts';
import type { ClockEntry, MinutesMoved, PeriodChoice, SetEffect } from './game-clock.ts';
import type { TimeoutCall } from './scoring-moves.ts';
import type { ScoringView, Side, TakenTimeout, TeamPanel } from './scoring-view.ts';

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
  /**
   * What setting the time typed does to the players' minutes: what comes off ("0:30") and
   * whether that is all this period has run, what is added, or that the period will start
   * there; null when the minutes do not move. The engine's own helper (`setEffect` of
   * game-clock.ts), so the form never says other than what is then done.
   */
  readonly effect: SetEffect | null;
  /** "20:00": how long the period being played is, said when a longer time is typed. */
  readonly periodLength: string;
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
  /** − on a team's timeouts: the latest comes back. It rests after each tap taken. */
  readonly takeBackTimeout: (side: Side, event: MouseEvent<HTMLButtonElement>) => void;
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
 * narrow (a phone, either way up) and holds a badge too, the count is written as the tiles
 * write a player's fouls ("10F"), so "Double bonus" is never cut. On a device whose
 * letters are too wide even for that, neither is set smaller: the badge says "Double"
 * (the first of its words; a screen reader is still given both, in the box's own name).
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
          {/* Where a device's letters are too wide for "Double bonus" beside the count,
              the badge keeps its size and its words wrap: the first line is what shows
              ("Double"), filled and beside the count as before. */}
          <span className="court-bonus-words">{t(`tracker.bonus.${team.bonus}`)}</span>
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
      {/* The one way to both teams' timeouts carries how many each has left, home first as
          on the scoreboard ("Timeouts 2 · 1"): a coach asks, and on a phone a team's
          heading has no room to say it. A team with none is marked, in red; a screen
          reader is told both in full. */}
      <button
        type="button"
        className="court-timeouts-button"
        data-timeouts-open=""
        aria-expanded={props.timeoutsOpen}
        aria-controls={props.padId}
        aria-label={t('tracker.timeouts.buttonLabel', {
          home: view.teams.home.name,
          homeLeft: leftText(view.teams.home.timeouts.left, t),
          away: view.teams.away.name,
          awayLeft: leftText(view.teams.away.timeouts.left, t),
        })}
        disabled={final}
        onClick={on.timeouts}
      >
        <span className="court-timeouts-word">{t('tracker.timeouts.title')}</span>
        <span className="court-timeouts-left" aria-hidden="true">
          {sides.map((side, place) => {
            const left = view.teams[side].timeouts.left;
            return (
              <Fragment key={side}>
                {/* The dot between the two numbers, drawn. */}
                {place === 0 ? null : <span className="court-timeouts-dot" />}
                <span
                  className="court-timeouts-count"
                  data-timeouts-left={side}
                  data-none={left === 0 ? '' : undefined}
                >
                  {left}
                </span>
              </Fragment>
            );
          })}
        </span>
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
          {/* On one line where the pad is wide; the period and time go under the words
              where it is narrow (a phone lying down), so neither is ever cut. */}
          <span className="court-start-words">
            <span className="court-start-title">
              {t(clock.start.tipOff ? 'tracker.start.tipOff' : 'tracker.start.title')}
            </span>
            <span className="court-start-when">
              {t('tracker.start.when', { period: period(view, t), clock: clock.text })}
            </span>
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

/** How many of the timeouts a team took are written out in the pad: the latest ones. */
export const timeoutsWritten = 2;

/**
 * The timeouts a team took, as the pad shows them during play (G7; the area 4 review of
 * step 2.36, M1): the latest first, since it is the one − takes back, then the one before
 * it, and how many came earlier as a count. Nothing in the pad scrolls and no entry is
 * cut, however many a team has taken; the whole list is the play log's (step 2.37).
 */
export function latestTimeouts(taken: readonly TakenTimeout[]): {
  readonly written: readonly TakenTimeout[];
  readonly earlier: number;
} {
  const written = taken.slice(-timeoutsWritten).reverse();
  return { written, earlier: taken.length - written.length };
}

/**
 * Both teams' timeouts, in the pad (G4 to G7): a button for each length saying how many
 * are left, the latest taken with their period and clock time, and − to take the latest
 * back. A team with none of a length left is asked about first, in the pad's lowest band,
 * away from the buttons that were just tapped.
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
          <div className="court-timeout-answers" data-timeout-answers="">
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
  const { written, earlier } = latestTimeouts(timeouts.taken);
  // Where the league has one length of timeout, an entry is its period and time and no
  // more: "Full" on every line says nothing. With two lengths each entry says which.
  const lengths = timeouts.offersShort;
  return (
    <section
      className="court-timeout-team"
      data-color={team.color}
      data-timeouts-of={team.side}
      data-taken-count={timeouts.taken.length}
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
      <div className="court-timeout-taken" data-lengths={lengths ? '' : undefined}>
        {written.length === 0 ? (
          <p className="court-quiet">{t('tracker.timeouts.noneTaken')}</p>
        ) : (
          <>
            <ul data-timeouts-taken={team.side}>
              {written.map((timeout) => (
                <li key={timeout.id}>
                  {t(
                    !lengths
                      ? 'tracker.timeouts.taken.one'
                      : timeout.seconds === 30
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
            {earlier === 0 ? null : (
              <p className="court-timeout-earlier" data-timeouts-earlier={team.side}>
                {t.plural('tracker.timeouts.earlier', earlier)}
              </p>
            )}
            <button
              type="button"
              className="court-opt court-opt-minus"
              data-act="untimeout"
              data-side={team.side}
              disabled={final}
              aria-label={t('tracker.timeouts.takeBack', { team: team.name })}
              onClick={(event) => on.takeBackTimeout(team.side, event)}
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

/** What the form says a set will do to the minutes, before it is done. */
function effectSaid(t: Translate, effect: SetEffect): string {
  // Taking back an earlier change to this period's clock: said as that, then what is
  // left over as a new correction, if anything.
  if (effect.kind !== 'start' && effect.takenBack !== null) {
    if (effect.rest === null) return t('tracker.clockSheet.takesBack', { time: effect.takenBack });
    return t(
      effect.kind === 'back'
        ? 'tracker.clockSheet.takesBackPutsBack'
        : 'tracker.clockSheet.takesBackAdds',
      { time: effect.takenBack, more: effect.rest },
    );
  }
  switch (effect.kind) {
    case 'back':
      return t(
        effect.wholePeriod ? 'tracker.clockSheet.putsBackAll' : 'tracker.clockSheet.putsBack',
        { back: effect.time },
      );
    case 'added':
      return t('tracker.clockSheet.adds', { time: effect.time });
    case 'start':
      return t('tracker.clockSheet.startsAt', { clock: effect.clock });
  }
}

/**
 * The sentence said once the clock is set to `clock` ("12:00"): what truly came off or was
 * added to the minutes (`minutesMoved` of game-clock.ts), or only the time it was set to.
 * Where the minutes moved, with a short form of one line for a phone short of room
 * ("Clock 12:00 · 4:55 added"); where a player moved by less than the figure, the short
 * form says only the time, and the full sentence (what a screen reader hears) the rest.
 */
export function clockSetSaid(
  t: Translate,
  clock: string,
  moved: MinutesMoved | null,
): string | { readonly text: string; readonly short: string } {
  const plain = t('tracker.say.clockSet', { clock });
  if (moved === null) return plain;
  // An earlier change taken back: the minutes go back to the players they came from, so
  // no even figure is promised; the short form names only the clock's change taken back.
  if (moved.takenBack !== null) {
    if (moved.rest === null)
      return {
        text: t('tracker.say.clockSetTakesBack', { clock, time: moved.takenBack }),
        short: t('tracker.say.clockSetTakesBackShort', { clock, time: moved.takenBack }),
      };
    return {
      text: t(
        moved.kind === 'back'
          ? 'tracker.say.clockSetTakesBackBack'
          : 'tracker.say.clockSetTakesBackAdded',
        { clock, time: moved.takenBack, more: moved.rest },
      ),
      short: plain,
    };
  }
  const text =
    moved.kind === 'back'
      ? t('tracker.say.clockSetBack', { clock, back: moved.time })
      : t('tracker.say.clockSetAdded', { clock, time: moved.time });
  if (!moved.even) return { text, short: plain };
  const short =
    moved.kind === 'back'
      ? t('tracker.say.clockSetBackShort', { clock, back: moved.time })
      : t('tracker.say.clockSetAddedShort', { clock, time: moved.time });
  return { text, short };
}

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
        : entry.problem === 'period'
          ? t('tracker.clockSheet.tooLong', {
              period: period(view, t),
              length: sheet.periodLength,
            })
          : sheet.effect !== null
            ? effectSaid(t, sheet.effect)
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
            {/* Until a time is typed this shows the clock as it reads NOW: while the clock
                runs it ticks with it (the screen's ticker writes `data-clock-now`), where
                it used to stand at the time the form was opened. A ticking clock is not
                read out second by second: only what is typed is announced. */}
            <output
              className="court-clock-entry"
              data-clock-entry=""
              data-typed={typed ? '' : undefined}
              data-clock-now={typed ? undefined : ''}
              data-problem={entry.ms === null && typed ? '' : undefined}
              aria-live={typed ? 'polite' : 'off'}
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
