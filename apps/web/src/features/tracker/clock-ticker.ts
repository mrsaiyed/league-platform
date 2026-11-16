// The timer that keeps a running game clock on the screen (step 2.36), with no drawing:
// when the clock is read, and when it is found to have run out. The reading itself is the
// screen's (it reads the SERVER's time and writes the clock's place and the minutes').
//
// It watches whether the page is shown (the code review of step 2.36). A browser slows or
// stops the timers of a page that is hidden: a phone locked at a timeout, another app in
// front. Left to itself the ticker would then say "Halftime." to nobody, a minute late or
// not at all, and show a stale clock for up to a second when the page came back. So while
// the page is hidden the timer is put down, and the moment the page is shown again the
// clock is read at once, from the server's time, which the controller carries on across a
// sleep: the first thing seen is the right time, and a period that ended meanwhile is
// said then, when someone is there to read it.

/** How often a running clock is read (checklist T3: four times a second). */
export const tickMs = 250;

export type ClockTickerDeps = {
  /** Reads the clock and writes it on the screen; says whether it is still running. */
  paint(): boolean;
  /** Called once, when the clock is found to have run out. */
  ranOut(): void;
  /** Runs `run` every `ms`; gives back what stops it. */
  every(ms: number, run: () => void): () => void;
};

export type ClockTicker = {
  /** The page was hidden, or is shown again. */
  shown(visible: boolean): void;
  /** The clock was stopped or the screen is gone: nothing more is read or said. */
  stop(): void;
};

/** A ticker for a clock that is running now; `visible` is whether the page is shown. */
export function createClockTicker(deps: ClockTickerDeps, visible: boolean): ClockTicker {
  let putDown: (() => void) | null = null;
  let over = false;
  const halt = () => {
    putDown?.();
    putDown = null;
  };
  const tick = () => {
    if (over || deps.paint()) return;
    over = true;
    halt();
    deps.ranOut();
  };
  const run = () => {
    if (!over && putDown === null) putDown = deps.every(tickMs, tick);
  };
  if (visible) run();
  return {
    shown(nowVisible) {
      if (!nowVisible) {
        halt();
        return;
      }
      tick();
      run();
    },
    stop() {
      over = true;
      halt();
    },
  };
}
