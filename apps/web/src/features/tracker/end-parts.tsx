// Ending a game, as it is drawn (step 2.37; checklist J1 to J5 and D12 of the 2.107
// audit; docs/build/DESIGN.md section 7). Each part draws what it is given and holds no
// state: use-end-game.ts owns what is asked and the taps, end-game.ts what each thing
// says, the message files the words.
//
// Everything here is in the pad, whose place never moves (the first design lead's
// decision, kept): a question's answers lie in the pad's lowest band, as the timeout
// question's do, away from whatever was tapped to ask it, and rest for a moment when
// they appear, so the second tap of a double tap is never an answer.
//
// - End game: behind More, first, since it is the one of those buttons every game needs;
//   and in the pad's first line, in gold, when the last period's clock has run out with
//   a team ahead (S-65: offered, never done by itself).
// - The question says the score, what ending does and, when the game is ended early,
//   that time is still on the clock. At a level score in a season with no ties there is
//   no question: the pad says what is still to play, and to play overtime only once the
//   last period has run out level (S-73).
// - The final panel, in the pad's place while the game is final: "Final", the score, who
//   won in words, whether the league has the result, and under them the way back: "Take
//   back End game" while the End has not reached the league, "Reopen game" with the time
//   left once it has.
// - The Reopen question, its reason field empty with the usual reason one tap beside it;
//   the question before leaving while plays wait (LeaveAsk); the Mark not started
//   question, which tells a scorekeeper to undo the plays first.
import {
  notStartedReasons,
  reopenReasonMaxLength,
  type NotStartedReason,
} from '@srleagues/contracts';
import type { Translate } from '@srleagues/site';
import type { MouseEvent, ReactNode } from 'react';
import type { EndQuestion, NotStartedQuestion } from './end-game.ts';

/** A tap on one of these: the click, or null when a key in a field made it. */
type AnswerTap = MouseEvent<HTMLElement> | null;

export type EndHandlers = {
  /** End game tapped, in More or in the pad: the question, or why not. */
  readonly endAsk: (event: MouseEvent<HTMLElement>) => void;
  readonly endAnswer: (end: boolean, event: MouseEvent<HTMLElement>) => void;
  /** "Take back End game", while the End has not reached the league. */
  readonly takeBackEnd: (event: MouseEvent<HTMLElement>) => void;
  readonly reopenAsk: (event: MouseEvent<HTMLElement>) => void;
  readonly reopenAnswer: (reopen: boolean, event: AnswerTap) => void;
  readonly reopenReason: (reason: string) => void;
  readonly notStartedAsk: (event: MouseEvent<HTMLElement>) => void;
  readonly notStartedAnswer: (mark: boolean, event: MouseEvent<HTMLElement>) => void;
  readonly notStartedReason: (reason: NotStartedReason) => void;
  /** "Back to the games" on the final panel: leaves the game, unless the panel only just appeared. */
  readonly finalBack: (event: MouseEvent<HTMLAnchorElement>) => void;
};

/** A question's title: what the group is named by, for a screen reader too. */
const askTitleId = 'court-ask-title';
/** What a question says under its title: read with each answer. */
const askTextId = 'court-ask-text';

/** End game behind More (checklist S6): first, since every game needs it once. */
export function MoreEnd(props: {
  readonly t: Translate;
  readonly on: Pick<EndHandlers, 'endAsk'>;
}) {
  const { t, on } = props;
  return (
    <div className="court-sheet-item">
      <button type="button" className="court-button" data-more-end="" onClick={on.endAsk}>
        {t('tracker.end.button')}
      </button>
      <p className="court-quiet">{t('tracker.end.help')}</p>
    </div>
  );
}

/** Mark not started behind More, while the game is live (checklist J5; S-40). */
export function MoreNotStarted(props: {
  readonly t: Translate;
  readonly on: Pick<EndHandlers, 'notStartedAsk'>;
}) {
  const { t, on } = props;
  return (
    <div className="court-sheet-item">
      <button
        type="button"
        className="court-button"
        data-more-not-started=""
        onClick={on.notStartedAsk}
      >
        {t('tracker.notStarted.button')}
      </button>
      <p className="court-quiet">{t('tracker.notStarted.help')}</p>
    </div>
  );
}

/**
 * The pad's first line when the last period's clock has run out with a team ahead: End
 * game, in gold as the one button that takes the next step, where "Pick the next period"
 * stands at any other 0:00 (the game night on step 2.36, L8). It only asks.
 */
export function EndOffer(props: {
  readonly t: Translate;
  /** "H2 is over. Hawks lead 52–48: end the game once the score is right." */
  readonly text: string;
  readonly on: Pick<EndHandlers, 'endAsk'>;
}) {
  const { t, text, on } = props;
  return (
    <div className="court-start" data-period-over="" data-end-offer="">
      <div className="court-start-row">
        <button
          type="button"
          className="court-start-button"
          data-kind="next"
          data-end-game=""
          aria-describedby="court-start-why"
          onClick={on.endAsk}
        >
          <span className="court-start-title">{t('tracker.end.button')}</span>
        </button>
      </div>
      <p className="court-start-why" id="court-start-why">
        {text}
      </p>
    </div>
  );
}

/** A question in the pad: its title, what it says, and its answers in the lowest band. */
function Ask(props: {
  readonly name: string;
  readonly title: string;
  readonly children: ReactNode;
  readonly answers: ReactNode;
}) {
  return (
    <div
      className="court-options court-ask"
      role="group"
      aria-labelledby={askTitleId}
      {...{ [`data-${props.name}`]: '' }}
    >
      <h2 className="court-ask-title" id={askTitleId}>
        {props.title}
      </h2>
      {props.children}
      <div className="court-ask-answers" data-ask-answers="">
        {props.answers}
      </div>
    </div>
  );
}

/**
 * "End the game?" (J1), or why it cannot end now (J3, S-73). `refused` is what the
 * league said of an End tap it did not take: the game is live again and the pad says so.
 */
export function EndAsk(props: {
  readonly t: Translate;
  readonly question: EndQuestion;
  readonly refused: string | null;
  readonly working: boolean;
  readonly on: Pick<EndHandlers, 'endAnswer'>;
}) {
  const { t, question, refused, on } = props;
  const keep = (
    <button
      type="button"
      className="court-opt"
      data-answer="no"
      aria-describedby={askTextId}
      onClick={(event) => on.endAnswer(false, event)}
    >
      {t('tracker.end.keep')}
    </button>
  );
  // Nothing left to end (the plays were undone under the question): the engine's own
  // sentence stands where the question stood.
  if (question.kind === 'nothing') {
    return (
      <Ask name="end-refused" title={t('tracker.end.ask.title')} answers={keep}>
        <div className="court-ask-text" id={askTextId} role="alert">
          <p data-end-why="">{question.text}</p>
        </div>
      </Ask>
    );
  }
  if (refused !== null || question.kind === 'level') {
    return (
      <Ask
        name="end-refused"
        title={t(refused !== null ? 'tracker.end.refusedTitle' : 'tracker.end.levelTitle')}
        answers={keep}
      >
        <div className="court-ask-text" id={askTextId} role="alert">
          <p className="court-ask-score" data-ask-score="">
            {question.score}
          </p>
          {refused !== null || question.kind !== 'level' || question.early === null ? (
            <p data-end-why="">{refused ?? t('tracker.end.level')}</p>
          ) : (
            // Time still to play: said, with the time ticking as in the End question.
            <p data-end-why="">
              {question.early.before}
              {question.early.clock === null ? null : (
                <span data-clock-now="">{question.early.clock}</span>
              )}
              {question.early.after}
            </p>
          )}
        </div>
      </Ask>
    );
  }
  return (
    <Ask
      name="end-ask"
      title={t('tracker.end.ask.title')}
      answers={
        <>
          {keep}
          <button
            type="button"
            className="court-opt court-opt-next"
            data-answer="yes"
            aria-describedby={askTextId}
            aria-disabled={props.working ? true : undefined}
            onClick={(event) => on.endAnswer(true, event)}
          >
            {t(props.working ? 'tracker.end.ending' : 'tracker.end.button')}
          </button>
        </>
      }
    >
      <div className="court-ask-text" id={askTextId}>
        <p className="court-ask-score" data-ask-score="">
          {question.score}
        </p>
        {/* Ended early: said right under the score, in the clock's own gold, and in words. */}
        {question.early === null ? null : (
          <p className="court-ask-warn" data-ask-early="">
            {question.early.before}
            {/* The time ticks with the game clock while the question stands: the
                screen's ticker writes it (scoring-screen.tsx, `data-clock-now`, as it
                writes the clock's own form). */}
            {question.early.clock === null ? null : (
              <span data-clock-now="">{question.early.clock}</span>
            )}
            {question.early.after}
          </p>
        )}
        {question.tie ? <p data-ask-tie="">{t('tracker.end.ask.level')}</p> : null}
        <p className="court-ask-more">{t('tracker.end.ask.does')}</p>
      </div>
    </Ask>
  );
}

/**
 * "Not sent yet" (lane 2.37, fix round, F1): a way off the screen was tapped while plays,
 * or the result, wait on this device. What waits is sent only while this screen is open,
 * so the answer that acts is to stay; leaving is offered, quietly, and loses nothing the
 * device holds. "Stay here" lies where "Back to the games" was: a double tap stays.
 */
export function LeaveAsk(props: {
  readonly t: Translate;
  /** The game is final: what waits is its result. */
  readonly final: boolean;
  /** How many plays wait on this device (step 2.37, part 2): the question says how many. */
  readonly waiting: number;
  readonly to: string;
  readonly on: {
    readonly stay: (event: MouseEvent<HTMLElement>) => void;
    readonly leave: (event: MouseEvent<HTMLAnchorElement>) => void;
  };
}) {
  const { t, on } = props;
  const why = props.final
    ? t('tracker.leave.result')
    : t.plural('tracker.leave.plays', Math.max(1, props.waiting));
  return (
    <Ask
      name="leave-ask"
      title={t('tracker.leave.title')}
      answers={
        <>
          <a
            className="court-opt"
            data-answer="leave"
            aria-describedby={askTextId}
            href={props.to}
            onClick={on.leave}
          >
            {t('tracker.leave.anyway')}
          </a>
          <button
            type="button"
            className="court-opt court-opt-next"
            data-answer="no"
            aria-describedby={askTextId}
            onClick={on.stay}
          >
            {t('tracker.leave.stay')}
          </button>
        </>
      }
    >
      <div className="court-ask-text" id={askTextId} role="alert">
        <p data-leave-why="">{why}</p>
        <p className="court-ask-more">{t('tracker.leave.kept')}</p>
      </div>
    </Ask>
  );
}

/** Where the End stands with the league, as the final panel draws it. */
export type FinalState =
  /** The End was tapped a moment ago and is on its way: nothing to worry about yet. */
  | 'sending'
  /** It has not reached the league: it can be taken back here, with no signal. */
  | 'not-sent'
  /**
   * It was sent and no answer came back, so the league may have it: it can no longer be
   * taken back here, and the next answer says whether it was saved (fix round, F2).
   */
  | 'checking'
  /** The league has it: Reopen is the way back. */
  | 'saved';

/**
 * The final panel (J4): in the pad's place for as long as the game is final. The fives
 * stay on the screen above it; a tap on a tile says the game is final (D12).
 */
export function FinalPanel(props: {
  readonly t: Translate;
  /** "Hawks won, 52–48": who won in words and the score, drawn large. */
  readonly won: string;
  readonly ended: FinalState;
  /** What the panel says about reopening, once the league has the result. */
  readonly reopenLine: string;
  /** Whether "Reopen game" is offered: not once the league has said no. */
  readonly reopenOffered: boolean;
  /** Why the last thing tapped here did not happen, in a sentence; null most of the time. */
  readonly problem: string | null;
  readonly working: boolean;
  readonly back: string;
  readonly on: Pick<EndHandlers, 'takeBackEnd' | 'reopenAsk' | 'finalBack'>;
}) {
  const { t, ended, on } = props;
  const saved = ended === 'saved';
  return (
    <div
      className="court-options court-final"
      role="group"
      aria-label={t('tracker.final.label')}
      data-final={ended}
    >
      <div className="court-final-result">
        <h2 className="court-label">{t('tracker.final.title')}</h2>
        <p className="court-final-won" data-final-won="">
          {props.won}
        </p>
      </div>
      <div className="court-final-state" role="status" data-final-state="">
        {saved ? (
          <p>{t('tracker.final.saved')}</p>
        ) : ended === 'sending' ? (
          <p>{t('tracker.final.sending')}</p>
        ) : ended === 'checking' ? (
          <p>
            <span className="court-final-unsent">{t('tracker.final.checkingSaved')}</span>{' '}
            {t('tracker.end.maybeSaved')}
          </p>
        ) : (
          <p>
            {/* In the amber of plays that wait, and in words. */}
            <span className="court-final-unsent">{t('tracker.final.notSentLead')}</span>{' '}
            {t('tracker.final.notSent')}
          </p>
        )}
        {props.problem !== null ? (
          <p className="court-ask-problem" role="alert" data-final-problem="">
            {props.problem}
          </p>
        ) : saved ? (
          <p className="court-quiet" data-reopen-line="">
            {props.reopenLine}
          </p>
        ) : null}
      </div>
      <div className="court-ask-answers" data-final-actions="">
        {saved ? (
          props.reopenOffered ? (
            <button
              type="button"
              className="court-opt"
              data-reopen=""
              aria-disabled={props.working ? true : undefined}
              onClick={on.reopenAsk}
            >
              {t('tracker.reopen.button')}
            </button>
          ) : (
            // Its place is kept, so "Back to the games" never moves under a finger.
            <span aria-hidden="true" />
          )
        ) : ended === 'checking' ? (
          // The End may be on the league: nothing to take back. The place is kept.
          <span aria-hidden="true" />
        ) : (
          <button
            type="button"
            className="court-opt"
            data-take-back=""
            aria-disabled={props.working ? true : undefined}
            onClick={on.takeBackEnd}
          >
            {t('tracker.end.takeBack')}
          </button>
        )}
        {/* The one filled button once the league has the result: the next step is to
            leave. While the result waits on this device it is not the step to take. */}
        <a
          className={saved ? 'court-opt court-opt-next' : 'court-opt'}
          data-final-back=""
          href={props.back}
          onClick={on.finalBack}
        >
          {t('tracker.final.back')}
        </a>
      </div>
    </div>
  );
}

/** The Reopen reason's field, named by its label. */
const reasonId = 'court-reopen-reason';

/**
 * "Reopen this game?" (S-36; the review of the two doors, points 5 and 6): what it does,
 * and the reason: an empty field with the usual reason one tap beside it ("By mistake"),
 * so nothing has to be typed over (the fix round, F6).
 */
export function ReopenAsk(props: {
  readonly t: Translate;
  readonly reason: string;
  readonly problem: string | null;
  readonly working: boolean;
  readonly on: Pick<EndHandlers, 'reopenAnswer' | 'reopenReason'>;
}) {
  const { t, on } = props;
  const mistake = t('tracker.reopen.reasonReady');
  return (
    <Ask
      name="reopen-ask"
      title={t('tracker.reopen.question')}
      answers={
        <>
          <button
            type="button"
            className="court-opt"
            data-answer="no"
            onClick={(event) => on.reopenAnswer(false, event)}
          >
            {t('tracker.reopen.cancel')}
          </button>
          <button
            type="button"
            className="court-opt court-opt-next"
            data-answer="yes"
            aria-describedby={askTextId}
            aria-disabled={props.working ? true : undefined}
            onClick={(event) => on.reopenAnswer(true, event)}
          >
            {t(props.working ? 'tracker.reopen.working' : 'tracker.reopen.confirm')}
          </button>
        </>
      }
    >
      <div className="court-ask-text" id={askTextId}>
        {props.problem !== null ? (
          <p className="court-ask-problem" role="alert" data-ask-problem="">
            {props.problem}
          </p>
        ) : (
          <p className="court-ask-more">{t('tracker.reopen.questionDetail')}</p>
        )}
      </div>
      <div className="court-ask-field">
        <label className="court-ask-field-label" htmlFor={reasonId}>
          {t('tracker.reopen.reasonLabel')}
        </label>
        {/* The field starts empty: nothing to type over. The usual reason is one tap
            beside it (the fix round, F6), and can still be changed. */}
        <div className="court-ask-field-row">
          <input
            type="text"
            id={reasonId}
            className="court-input"
            data-reopen-reason=""
            value={props.reason}
            maxLength={reopenReasonMaxLength}
            autoComplete="off"
            enterKeyHint="done"
            onChange={(event) => on.reopenReason(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              on.reopenAnswer(true, null);
            }}
          />
          <button
            type="button"
            className="court-opt"
            data-reopen-mistake=""
            aria-label={t('tracker.reopen.reasonMistakeFill', { reason: mistake })}
            onClick={() => on.reopenReason(mistake)}
          >
            {t('tracker.reopen.reasonMistake')}
          </button>
        </div>
      </div>
    </Ask>
  );
}

/**
 * "Mark this game as not started?" (J5; S-40; the review of the two doors, point 6).
 * With plays standing a scorekeeper is told to undo them first and is offered no "yes";
 * someone who may correct games picks a reason from the fixed list. `askReason` also
 * once the league has asked for one.
 */
export function NotStartedAsk(props: {
  readonly t: Translate;
  readonly question: NotStartedQuestion;
  readonly askReason: boolean;
  readonly reason: NotStartedReason;
  readonly problem: string | null;
  readonly working: boolean;
  readonly on: Pick<EndHandlers, 'notStartedAnswer' | 'notStartedReason'>;
}) {
  const { t, question, on } = props;
  return (
    <Ask
      name="not-started-ask"
      title={t('tracker.notStarted.question')}
      answers={
        <>
          <button
            type="button"
            className="court-opt"
            data-answer="no"
            onClick={(event) => on.notStartedAnswer(false, event)}
          >
            {t('tracker.notStarted.no')}
          </button>
          {question.kind === 'undo-first' ? null : (
            // Red: it takes every play of the game away.
            <button
              type="button"
              className="court-opt court-opt-foul"
              data-answer="yes"
              aria-describedby={askTextId}
              aria-disabled={props.working ? true : undefined}
              onClick={(event) => on.notStartedAnswer(true, event)}
            >
              {t(props.working ? 'tracker.notStarted.working' : 'tracker.notStarted.yes')}
            </button>
          )}
        </>
      }
    >
      <div className="court-ask-text" id={askTextId}>
        {props.problem !== null ? (
          <p className="court-ask-problem" role="alert" data-ask-problem="">
            {props.problem}
          </p>
        ) : (
          <p data-not-started-says={question.kind}>{question.text}</p>
        )}
      </div>
      {props.askReason ? (
        <label className="court-ask-field">
          <span className="court-ask-field-label">{t('tracker.notStarted.reason')}</span>
          <select
            className="court-input"
            data-not-started-reason=""
            value={props.reason}
            onChange={(event) => {
              const picked = notStartedReasons.find((reason) => reason === event.target.value);
              if (picked !== undefined) on.notStartedReason(picked);
            }}
          >
            {notStartedReasons.map((reason) => (
              <option key={reason} value={reason}>
                {t(`tracker.notStarted.reasons.${reason}`)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </Ask>
  );
}
