'use client';
// Ending a game on the scoring screen (step 2.37): what is asked, what was tapped and
// what the league answered, kept apart from scoring-screen.tsx so that file's own state
// stays small. It draws nothing (end-parts.tsx) and works nothing out (end-game.ts,
// play-log.ts); it hands the controller's calls their taps:
//
// - End game is a tap like any other (`{ type: 'end' }`): applied on the device at once,
//   kept, and sent in order, also with no connection.
// - "Take back End game" is the device's own, while the End has not reached the league.
// - Reopen and Mark not started are requests of the league (game-doors.ts): the
//   controller makes each once nothing is waiting to send, and carries on in place.
//
// What the league says about reopening is read once the league has the End, and the
// minutes left are counted from the SERVER's time, never the device's clock.
import type { NotStartedReason, ReopenOffer } from '@srleagues/contracts';
import type { Translate } from '@srleagues/site';
import type { basketball } from '@srleagues/sports';
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import {
  endQuestion,
  endRefusedText,
  notStartedProblemText,
  notStartedQuestion,
  notStartedReasonReady,
  reopenLine,
  reopenMayRetry,
  reopenOffered,
  reopenProblemText,
  takeBackProblemText,
  type ReopenLine,
} from './end-game.ts';
import type { EndHandlers, FinalState } from './end-parts.tsx';
import type { ClockReading } from './game-clock.ts';
import { endState, refusedEnd } from './play-log.ts';
import { padAtRest, type PadMode } from './scoring-moves.ts';
import { tapTaken, type Tap, type TapRest } from './tap-rest.ts';
import type { TapInput, TrackerController, TrackerControllerStatus } from './tracker-controller.ts';

/**
 * How long a fresh End reads "Sending the result…" before it reads "Not sent yet": with
 * a connection the league has it well within this, and the panel never flashes amber.
 */
export const sendingForMs = 1500;
/** How often the league is asked again about reopening while it has not answered. */
const offerAgainMs = 15_000;
/** How often the minutes left to reopen are counted again. */
const minutesEveryMs = 20_000;

/** Which panel a problem was met in: it is shown there and nowhere else. */
type Problem = { readonly on: 'final' | 'reopen' | 'not-started'; readonly text: string };

export type EndGameArgs = {
  readonly controller: TrackerController;
  readonly status: TrackerControllerStatus;
  readonly state: basketball.GameState;
  readonly names: { readonly home: string; readonly away: string };
  /** A level score may end the game (S-73), as the rosters said when the page was drawn. */
  readonly allowTies: boolean | undefined;
  /** A hint for the Mark not started question's words only; the league decides (S-40). */
  readonly mayCorrect: boolean;
  /** The device knows it has no connection: a fresh End is said to wait, at once. */
  readonly offline: boolean;
  readonly t: Translate;
  /** The clock as it reads now. */
  readonly reading: () => Pick<ClockReading, 'over' | 'text'>;
  /** What the pad is to show next, as the taps so far leave it. */
  readonly wanted: { readonly current: PadMode };
  readonly showPad: (mode: PadMode) => void;
  readonly say: (text: string) => void;
  /** Takes off what the screen last said: a question is not asked under an old sentence. */
  readonly quiet: () => void;
  /** The screen's own way to hand a tap to the controller: a refusal is said by it. */
  readonly tap: (input: TapInput) => Promise<{ readonly ok: boolean }>;
  /**
   * Closes More, where End game and Mark not started are. `at` is when the tap was made:
   * its double is taken nowhere on the screen.
   */
  readonly closeMore: (at: number) => void;
  /** Where the keyboard goes once the pad is drawn. */
  readonly focus: (selector: string) => void;
  readonly rests: { readonly asked: TapRest; readonly final: TapRest };
  /** Leaving by a link: the session is released first. */
  readonly leave: (to: string) => (event: MouseEvent<HTMLAnchorElement>) => void;
  readonly back: string;
};

export type EndGame = {
  readonly on: EndHandlers;
  /** Where the End stands with the league; null while the game is not final. */
  readonly ended: FinalState | null;
  readonly reopenLine: ReopenLine;
  readonly reopenReason: string;
  readonly clearReason: NotStartedReason;
  /** The league asked for a reason before clearing: the list is shown whatever the hint said. */
  readonly reasonAsked: boolean;
  /** Something asked of the device or the league is under way: its button says so. */
  readonly working: boolean;
  /** The problem to show in the panel `on` names, or null. */
  readonly problemOn: (on: Problem['on']) => string | null;
};

const tapOf = (event: MouseEvent): Tap => ({ at: event.timeStamp, keyboard: event.detail === 0 });
const noAnswer = '[data-pad] [data-answer="no"]';

export function useEndGame(args: EndGameArgs): EndGame {
  const { controller, status, state, names, t, wanted, showPad, say, rests } = args;
  const [offer, setOffer] = useState<ReopenOffer | null>(null);
  const [, setTick] = useState(0);
  const [reopenReason, setReopenReason] = useState('');
  const [clearReason, setClearReason] = useState<NotStartedReason>(notStartedReasonReady);
  const [reasonAsked, setReasonAsked] = useState(false);
  const [working, setWorking] = useState(false);
  // What `working` will be once drawn: read here, so a second tap before the next
  // drawing cannot make the same request twice.
  const busy = useRef(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  /** The End tapped a moment ago on this screen is taken to be on its way. */
  const [fresh, setFresh] = useState(false);
  const freshTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (freshTimer.current !== null) window.clearTimeout(freshTimer.current);
    },
    [],
  );

  /** One thing at a time; `working` is drawn while it runs. */
  const during = async (work: () => Promise<void>): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    try {
      await work();
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };

  const where = endState(status);
  /**
   * "Take back End game" found the End sent with no answer back (lane 2.37, fix round,
   * F2): the league may have it, so the panel says it is checking until the league's
   * next answer, and offers no take back meanwhile.
   */
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (where !== 'not-sent') setChecking(false);
  }, [where]);
  const ended: FinalState | null =
    where === 'live'
      ? null
      : where === 'saved'
        ? 'saved'
        : checking
          ? 'checking'
          : fresh && !args.offline
            ? 'sending'
            : 'not-sent';

  // --- What the league says about reopening, once it has the End (S-36). ---
  const saved = where === 'saved';
  const askOffer = useCallback(async (): Promise<ReopenOffer | null> => {
    const answer = await controller.reopenOffer();
    if (answer !== null) setOffer(answer);
    return answer;
  }, [controller]);
  const known = offer !== null;
  useEffect(() => {
    if (!saved) {
      setOffer(null);
      return;
    }
    if (known) return;
    let gone = false;
    const ask = () => {
      void controller.reopenOffer().then((answer) => {
        if (!gone && answer !== null) setOffer(answer);
      });
    };
    ask();
    // No answer (no connection): asked again until there is one.
    const timer = window.setInterval(ask, offerAgainMs);
    return () => {
      gone = true;
      window.clearInterval(timer);
    };
  }, [saved, known, controller]);
  // The minutes left run down while the panel stands.
  const counting = saved && offer?.reopen.when === 'until';
  useEffect(() => {
    if (!counting) return;
    const timer = window.setInterval(() => setTick((n) => n + 1), minutesEveryMs);
    return () => window.clearInterval(timer);
  }, [counting]);
  const line = reopenLine(saved ? offer : null, status.now());

  // --- An End the league did not take (an older page, a rule changed mid-game): the
  // controller has rebuilt the game without it, live again. The pad says why, and the
  // tap is dropped from the list of taps not applied, so no notice grows for it. ---
  const refused = refusedEnd(status);
  const refusedId = refused?.commandId ?? null;
  const refusedMessage = refused?.message ?? '';
  useEffect(() => {
    if (refusedId === null) return;
    const game = controller.status().game;
    if (game === null) return;
    rests.asked.begin();
    args.quiet();
    showPad({ kind: 'end', refused: endRefusedText(game, refusedMessage, t).text });
    void controller.dismissNotApplied([refusedId]);
    // `showPad` and the rests are the screen's own for its whole life: the pad is asked
    // once for each refused End, not again with every drawing.
  }, [refusedId, refusedMessage, controller, t]);

  const on: EndHandlers = {
    endAsk(event) {
      args.closeMore(event.timeStamp);
      const game = controller.status().game ?? state;
      if (game.status === 'final') return say(t('tracker.refusal.gameFinal'));
      const question = endQuestion(game, names, args.allowTies, args.reading(), t);
      // Nothing recorded yet: the engine's own sentence, and nothing is asked (J2).
      if (question.kind === 'nothing') return say(question.text);
      // The answers rest from this tap: its double is not an answer.
      rests.asked.begin(event.timeStamp);
      args.quiet();
      showPad({ kind: 'end', refused: null });
      if (event.detail === 0) args.focus(noAnswer);
    },
    endAnswer(end, event) {
      const now = wanted.current;
      if (now.kind !== 'end' || !tapTaken(rests.asked, tapOf(event))) return;
      if (!end || now.refused !== null) return showPad(padAtRest);
      void during(async () => {
        // The final panel's own buttons rest from this tap, for longer: under "End
        // game" lies "Back to the games", and a slow double tap must not leave.
        rests.final.begin(event.timeStamp);
        setProblem(null);
        setFresh(true);
        if (freshTimer.current !== null) window.clearTimeout(freshTimer.current);
        freshTimer.current = window.setTimeout(() => setFresh(false), sendingForMs);
        const result = await args.tap({ type: 'end' });
        if (!result.ok) setFresh(false);
        // Final now: the pad shows the final panel whatever is asked for (`padFor`).
        showPad(padAtRest);
      });
    },
    takeBackEnd(event) {
      if (!tapTaken(rests.final, tapOf(event))) return;
      void during(async () => {
        const result = await controller.takeBackEnd();
        if (!result.ok && result.reason === 'maybe-saved') {
          // Said by the panel itself, in place of "Not sent yet", until the league answers.
          setProblem(null);
          return setChecking(true);
        }
        if (!result.ok) return setProblem({ on: 'final', text: takeBackProblemText(result, t) });
        setProblem(null);
        showPad(padAtRest);
        // The clock stays stopped where the End found it (S-72): said, since Start is next.
        say(t('tracker.end.takenBack'));
      });
    },
    reopenAsk(event) {
      if (!tapTaken(rests.final, tapOf(event))) return;
      const keyboard = event.detail === 0;
      const at = event.timeStamp;
      void during(async () => {
        // Never a reason typed and then refused for time: the league is asked first.
        const answer = offer ?? (await askOffer());
        if (answer === null) {
          return setProblem({ on: 'final', text: t('tracker.reopen.problem.unanswered') });
        }
        if (!reopenOffered(reopenLine(answer, status.now()))) return setProblem(null);
        setProblem(null);
        setReopenReason((typed) => (typed === '' ? t('tracker.reopen.reasonReady') : typed));
        rests.asked.begin(at);
        args.quiet();
        showPad({ kind: 'reopen' });
        if (keyboard) args.focus(noAnswer);
      });
    },
    reopenAnswer(reopen, event) {
      if (wanted.current.kind !== 'reopen') return;
      if (event !== null && !tapTaken(rests.asked, tapOf(event))) return;
      if (!reopen) {
        setProblem(null);
        // "Reopen game" lies where "Keep it final" was: the final panel rests from this
        // tap, so its double does not ask the question again.
        rests.final.begin(event?.timeStamp);
        return showPad(padAtRest);
      }
      const reason = reopenReason.trim();
      if (reason === '') {
        return setProblem({ on: 'reopen', text: t('tracker.reopen.refused.reason-needed') });
      }
      void during(async () => {
        const result = await controller.reopen(reason);
        if (result.ok) {
          setProblem(null);
          setReopenReason('');
          setOffer(null);
          showPad(padAtRest);
          return say(t('tracker.reopen.done'));
        }
        const text = reopenProblemText(result, t);
        // Worth asking again as it stands (no connection, plays still going out): the
        // question stays, with the reason typed. Otherwise the league has answered: the
        // final panel says why, and asks the league again what it offers now.
        if (reopenMayRetry(result)) return setProblem({ on: 'reopen', text });
        setProblem({ on: 'final', text });
        showPad(padAtRest);
        void askOffer();
      });
    },
    reopenReason: setReopenReason,
    notStartedAsk(event) {
      args.closeMore(event.timeStamp);
      const game = controller.status().game ?? state;
      if (game.status === 'final') return say(t('tracker.notStarted.refused.game-final'));
      if (game.status !== 'live') return say(t('tracker.notStarted.refused.game-not-started'));
      setProblem(null);
      setReasonAsked(false);
      setClearReason(notStartedReasonReady);
      rests.asked.begin(event.timeStamp);
      args.quiet();
      showPad({ kind: 'not-started' });
      if (event.detail === 0) args.focus(noAnswer);
    },
    notStartedAnswer(mark, event) {
      if (wanted.current.kind !== 'not-started' || !tapTaken(rests.asked, tapOf(event))) return;
      const game = controller.status().game ?? state;
      const question = notStartedQuestion(game, names, args.mayCorrect, t);
      if (!mark || question.kind === 'undo-first') {
        setProblem(null);
        return showPad(padAtRest);
      }
      void during(async () => {
        const withReason = question.kind === 'clears' || reasonAsked;
        const result = await controller.markNotStarted(withReason ? clearReason : undefined);
        if (result.ok) {
          setProblem(null);
          showPad(padAtRest);
          return say(t('tracker.notStarted.done'));
        }
        // The league wants a reason the hint did not expect: the list is shown.
        if (result.reason === 'refused' && result.code === 'reason-needed') setReasonAsked(true);
        setProblem({ on: 'not-started', text: notStartedProblemText(result, t) });
      });
    },
    notStartedReason: setClearReason,
    finalBack(event) {
      // The panel only just appeared under the finger: this tap was not meant for it.
      if (!tapTaken(rests.final, tapOf(event))) return event.preventDefault();
      args.leave(args.back)(event);
    },
  };

  return {
    on,
    ended,
    reopenLine: line,
    reopenReason,
    clearReason,
    reasonAsked,
    working,
    problemOn: (panel) => (problem?.on === panel ? problem.text : null),
  };
}
