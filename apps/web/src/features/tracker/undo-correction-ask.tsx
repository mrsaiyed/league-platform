// Undo on a play a correction wrote (step 2.65, T-408). An admin's box score grid writes
// its plays through the same door as the scoring screen, so once the game is reopened the
// scorekeeper's Undo would walk back into the correction, newest first, with nothing to
// tell it. The server names those plays (`corrections` in the tracker's state, read from
// the mark each one carries), and when the play Undo would take back is one of them the
// screen asks first, in plain words. "Leave it" does nothing; "Take it back" is the
// ordinary Undo, from that tap, with or without a signal. Every other Undo asks nothing.
import type { Translate } from '@srleagues/site';
import type { basketball } from '@srleagues/sports';
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';

type Tap = MouseEvent<HTMLButtonElement>;

/** Whether the play Undo would take back now is one a correction wrote. */
export const undoesCorrection = (
  game: basketball.GameState | null,
  corrections: readonly string[],
): boolean => {
  if (game === null || game.status === 'final' || corrections.length === 0) return false;
  const last = game.plays.at(-1);
  return last !== undefined && corrections.includes(last.id.toLowerCase());
};

/**
 * Undo tapped: `go` at once, unless the play it would take back is a correction's, when
 * `ask` is given `go` to run on "Take it back" and nothing else happens.
 */
export const undoTapped = (
  asks: boolean,
  event: Tap,
  go: (event: Tap) => void,
  ask: (go: (event: Tap) => void) => void,
): void => {
  if (asks) ask(go);
  else go(event);
};

/** The question: "Leave it" (which has the keyboard first) closes it, "Take it back" undoes. */
export function UndoCorrectionQuestion(props: {
  readonly t: Translate;
  readonly leaveRef?: RefObject<HTMLButtonElement | null>;
  readonly onLeave: () => void;
  readonly onTakeBack: (event: Tap) => void;
}) {
  const { t, onLeave, onTakeBack } = props;
  return (
    <div className="court-sheet-wrap" data-undo-correction="">
      <div className="court-scrim" onClick={onLeave} />
      <div
        className="court-sheet"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="court-undo-correction"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onLeave();
        }}
      >
        <p id="court-undo-correction">{t('tracker.undo.correctionAsk')}</p>
        <div className="court-sheet-head">
          <button
            type="button"
            className="court-opt"
            data-undo-correction-leave=""
            ref={props.leaveRef}
            onClick={onLeave}
          >
            {t('tracker.undo.correctionLeave')}
          </button>
          <button
            type="button"
            className="court-opt"
            data-undo-correction-take=""
            onClick={onTakeBack}
          >
            {t('tracker.undo.correctionTakeBack')}
          </button>
        </div>
      </div>
    </div>
  );
}

export type UndoAsk = {
  /** Undo tapped: asks first when its play is a correction's, else goes on at once. */
  readonly undo: (event: Tap, go: (event: Tap) => void) => void;
  /** The question while it is asked; null otherwise. */
  readonly ask: ReactNode;
};

/**
 * `game` is read at the tap (the device's game as it stands then), `corrections` as the
 * server's last state named them.
 */
export function useUndoAsk(
  t: Translate,
  game: () => basketball.GameState | null,
  corrections: readonly string[],
): UndoAsk {
  const [go, setGo] = useState<((event: Tap) => void) | null>(null);
  const leave = useRef<HTMLButtonElement | null>(null);
  const asking = go !== null;
  useEffect(() => {
    if (asking) leave.current?.focus();
  }, [asking]);
  const undo = (event: Tap, next: (event: Tap) => void) =>
    undoTapped(undoesCorrection(game(), corrections), event, next, (later) => setGo(() => later));
  const close = () => setGo(null);
  const ask =
    go === null ? null : (
      <UndoCorrectionQuestion
        t={t}
        leaveRef={leave}
        onLeave={close}
        onTakeBack={(event) => {
          close();
          go(event);
        }}
      />
    );
  return { undo, ask };
}
