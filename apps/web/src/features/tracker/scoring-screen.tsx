'use client';
// The scoring screen on the device (step 2.35): it holds what is picked on the screen
// (the starters being tapped, whose options are open, what was last said) and sends every
// action to the controller that exists (tracker-controller.ts). It keeps no copy of the
// game: what is drawn is the controller's game, through scoring-view.ts.
//
// Step 2.36 added the clock: Start, Pause, setting it, periods, the large Start clock
// button, team fouls with the bonus horn, and timeouts. The clock is read from the
// server's time (game-clock.ts) and written into its place by a ticker that draws
// nothing else again. Start, Pause and setting the clock are taps like any other, and
// are not plays: Undo (step 2.37) takes back the last play, never a clock correction.
//
// A tap answers at once (finding M6; DESIGN.md section 7, line 9). What is painted before
// the controller has the tap: a tapped player's ring, and for an option the tile's mark
// ("+2"), drawn hollow, as taken and not as a recorded play. When the controller answers,
// the mark turns solid (stored) or is taken off at once with the refusal's sentence
// (tile-marks.ts). No number changes before the controller has stored the tap and shows
// the game with it: the write-before-show rule (T-114) stays.
import type { Translate } from '@srleagues/site';
import { basketball } from '@srleagues/sports';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {
  bonusRises,
  browserHornAudio,
  createBonusHorn,
  type BonusHorn,
  type BonusShown,
} from './bonus-horn.ts';
import {
  clockModeShown,
  deviceStore,
  lastMinutesStop,
  lastMinutesStopDismissal,
  mercyDismissal,
  mercySwitch,
  readMercyDismissed,
  switchedClock,
  writeMercyDismissed,
} from './clock-mode.ts';
import {
  clockSetSaid,
  LastMinutesStopNotice,
  MercyNotice,
  type ClockSheet,
  type CourtClock,
} from './clock-parts.tsx';
import { createClockTicker } from './clock-ticker.ts';
import { CourtView, type CourtBanner, type CourtHandlers, type CourtSlots } from './court-view.tsx';
import {
  endOfferText,
  endQuestion,
  notStartedQuestion,
  reopenLineText,
  reopenOffered,
  wonText,
} from './end-game.ts';
import {
  EndAsk,
  EndOffer,
  FinalPanel,
  LeaveAsk,
  MoreEnd,
  MoreNotStarted,
  NotStartedAsk,
  ReopenAsk,
} from './end-parts.tsx';
import { findPlayer, periodText, playerLabel, refusalText } from './engine-words.ts';
import {
  clockEntry,
  clockEntryKey,
  minutesMoved,
  minutesNow,
  periodChoices,
  periodEnd,
  readClock,
  setEffect,
  startOffered,
  stopKey,
  stopReason,
  type ClockReading,
  type StopReason,
} from './game-clock.ts';
import type { OpenedTrackerGame } from './open-tracker-game.ts';
import type { DeviceRosters, LineupPicks } from './opened-game-storage.ts';
import { endOffered, playLog, redoTarget, redoneText, undoTarget, undoneText } from './play-log.ts';
import { useUndoAsk } from './undo-correction-ask.tsx';
import {
  LatestPlays,
  MoreLog,
  PlayLogPanel,
  PlayLogSheet,
  UndoRedo,
  type PlaysHandlers,
} from './plays-parts.tsx';
import {
  dropOn,
  padAtRest,
  padFor,
  padIsFor,
  padTap,
  pickFromBench,
  startShortHanded,
  subTap,
  swapColorsTap,
  tapTile,
  timeoutTap,
  type PadAction,
  type PadMode,
  type TimeoutCall,
} from './scoring-moves.ts';
import {
  findTile,
  scoringView,
  timeoutTakenBack,
  type PlayerTile,
  type ScoringView,
} from './scoring-view.ts';
import {
  clockToggleTap,
  createTapRest,
  drawRest,
  restMs,
  startBarTap,
  takeBackRestMs,
  takeBackTimeoutTap,
  tapTaken,
  type RestTimers,
  type Tap,
  type TapRest,
} from './tap-rest.ts';
import { keepsTurnovers } from './device-rosters.ts';
import { createTileDrag, type TileDrag } from './tile-drag.ts';
import { createTileMarks, type MarkKind, type TileMark, type TileMarks } from './tile-marks.ts';
import type { TapInput, TapResult, TrackerControllerStatus } from './tracker-controller.ts';
import { useEndGame } from './use-end-game.ts';
import { usePlayersPanel } from './use-players-panel.tsx';

export type ScoringScreenProps = {
  readonly game: OpenedTrackerGame;
  readonly status: TrackerControllerStatus;
  /** The game as the controller shows it: never null on this screen. */
  readonly state: basketball.GameState;
  readonly rosters: DeviceRosters;
  readonly t: Translate;
  readonly title: string;
  readonly when: string | null;
  readonly banner: CourtBanner;
  readonly notices?: ReactNode;
  readonly links: { readonly back: string; readonly account: string; readonly watch: string };
  readonly leave: (to: string) => (event: MouseEvent<HTMLAnchorElement>) => void;
  readonly slots?: CourtSlots;
  /** The account button of step 2.127, beside More in the frame's first row. */
  readonly account?: ReactNode;
  /**
   * A tap was made as this device stopped scoring and was not recorded: this screen is
   * about to be replaced, so the page that replaces it says so.
   */
  readonly onNotRecorded?: () => void;
  /**
   * The account may correct games, not only score them: a hint for what the Mark not
   * started question says (S-40). The league stays the judge. Left out: a scorekeeper.
   */
  readonly mayCorrect?: boolean;
  /** The device knows it has no connection (queue-banner.ts): an End just tapped waits. */
  readonly offline?: boolean;
  /** The game's id: what is typed in the Players panel is kept on the device under it. */
  readonly gameId?: string;
  /** Who is signed in: the panel's typing is kept per person too (T-327). */
  readonly accountId: string;
};

/** How long the latest sentence stays (checklist I5). */
const saidForMs = 3200;

/**
 * How many of the newest plays are worded while the whole log is shut: what the log's
 * own panel shows on a tablet lying down, with the way to the rest under them.
 */
const panelRows = 30;
/** How many of them the pad lists at rest where it has the room (a tablet upright). */
const latestRows = 4;
/**
 * Where the play log has its own panel under the pad: a tablet lying down with its
 * height to spare. The same words as the stylesheet's own (court.css), which draws the
 * panel there; the screen reads them so that a phone, which has no such panel, does not
 * word and draw thirty lines nobody sees with every tap (finding M6).
 */
const logPanelWhere = '(min-width: 880px) and (min-height: 760px)';

/**
 * An upright phone, in the stylesheet's own words (court.css): it has no room above the
 * teams for a notice, so the notices are drawn in the pad at rest (step 2.37).
 */
const uprightPhone = '(max-width: 699px) and (orientation: portrait)';

/** Whether the screen is one where `query` holds now; drawn again when that changes. */
function useScreenIs(query: string): boolean {
  const subscribe = useCallback(
    (changed: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', changed);
      return () => media.removeEventListener('change', changed);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** What the keyboard can stop on in a dialog: its buttons and links, and a list that scrolls. */
const dialogStops = 'button:not(:disabled), a[href], [tabindex="0"]';

/** The tile of a player, in the teams' panels (not the pad's buttons). */
const tileElement = (root: HTMLElement | null, playerId: string): HTMLElement | null =>
  root?.querySelector<HTMLElement>(`[data-teams] [data-player="${CSS.escape(playerId)}"]`) ?? null;

/** The browser's own timers, for the tiles' marks. */
const markTimers = {
  after: (ms: number, run: () => void) => {
    const timer = window.setTimeout(run, ms);
    return () => window.clearTimeout(timer);
  },
};

/** The browser's own steady clock and timers, for the controls that rest (tap-rest.ts). */
const restTimers: RestTimers = {
  now: () => performance.now(),
  after: markTimers.after,
};

/**
 * The controls that rest for a moment after they come under the finger (tap-rest.ts),
 * and where each is on the screen: while one rests it is marked `data-resting`, and the
 * stylesheet draws it not yet ready.
 */
const restingPlaces = {
  /** The pad's large Start clock button and its ×, after the pad comes to rest (M5). */
  start: '[data-pad] [data-start-bar]',
  /** Start or Pause under the scoreboard, after a tap on it and after its word changes. */
  toggle: '[data-clock-toggle]',
  /** − on a team's timeouts, after a take-back, for longer (the area 4 review, M2). */
  minus: '[data-pad] [data-act="untimeout"]',
  /** The answers to "Record it anyway?", after the question is asked. */
  answers: '[data-pad] [data-timeout-answers]',
  /**
   * Undo and Redo, after each tap taken, for as long as − (step 2.37): each tap takes
   * one play back or brings one back, so a double tap, fast or slow, must act on one.
   */
  undo: '[data-undo]',
  redo: '[data-redo]',
  /**
   * The answers to a question about ending the game (End game, Reopen, Mark not
   * started), after it is asked: the double of the tap that asked is not an answer.
   */
  asked: '[data-pad] [data-ask-answers]',
  /**
   * The final panel's own buttons, after End game is answered, for as long as −: "Back
   * to the games" lies where "End game" was, and a slow double tap must not leave.
   */
  final: '[data-pad] [data-final-actions]',
  /**
   * The mercy rule's answers, after the notice comes up (step 2.69's fix round): it comes
   * with the basket that crossed the lead, where that basket's "+2" was, and the second of
   * two fast taps is not an answer.
   */
  mercy: '[data-mercy-notice] .court-mercy-acts, [data-last-minutes-stop] .court-mercy-acts',
  /**
   * The answers to Undo's question about a correction's play (step 2.65), after it is
   * asked: the double of the Undo tap that asked is not an answer.
   */
  undoAsked: '[data-undo-correction] .court-sheet-head',
} as const;
type RestingPlace = keyof typeof restingPlaces;
const restingNames = Object.keys(restingPlaces) as RestingPlace[];

/** A click as the guards read it: when the finger made it, and whether a key did. */
const tapOf = (event: MouseEvent): Tap => ({ at: event.timeStamp, keyboard: event.detail === 0 });

/** Tells a tap's marks how the tap ended. */
const answerMarks = (marks: readonly TileMark[], taken: boolean): void => {
  for (const mark of marks) {
    if (taken) mark.stored();
    else mark.refused();
  }
};

/**
 * Rings a tapped tile at once, before its options are drawn: written straight onto the
 * element, under a name of its own (`data-tapped`) so the screen's next drawing, which
 * rings the open tile itself (`data-open`), neither fights it nor leaves it behind.
 */
function ringTile(root: HTMLElement | null, playerId: string): void {
  // The tile that was open gives up its ring in the same frame (`data-tapped="off"`).
  // Only the two tiles are touched, so the browser has only those two to restyle.
  for (const open of root?.querySelectorAll('[data-teams] [data-open]') ?? []) {
    open.setAttribute('data-tapped', 'off');
  }
  tileElement(root, playerId)?.setAttribute('data-tapped', 'on');
}

/** Takes the rings of `ringTile` off again: the screen has drawn the open tile's own. */
function unringTiles(root: HTMLElement | null): void {
  for (const tile of root?.querySelectorAll('[data-tapped]') ?? []) {
    tile.removeAttribute('data-tapped');
  }
}

/**
 * Runs `work` once the screen has been painted. What must show at once (a tile's ring,
 * what was tapped) is written straight onto its element first; the rest of the screen is
 * drawn again after that frame, so a slow tablet answers the tap before it does the work
 * (finding M6). A page that is not being drawn still does the work, a moment later.
 */
function afterPaint(work: () => void): void {
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    work();
  };
  window.requestAnimationFrame(() => window.setTimeout(once, 0));
  window.setTimeout(once, 150);
}

/**
 * Rings a button the moment it is tapped, before the tap is stored (finding M6): Start
 * and Pause change their word only once the device has kept the tap (T-114), and the
 * ring says meanwhile that the tap was taken. Gives back what takes the ring off again.
 */
function taken(button: Element): () => void {
  button.setAttribute('data-taken', '');
  return () => button.removeAttribute('data-taken');
}

/** Writes `text` into a place React drew, keeping React's own text node where there is one. */
function writeText(place: Element | null, text: string): void {
  if (place === null || place.textContent === text) return;
  const only = place.childNodes.length === 1 ? place.firstChild : null;
  if (only !== null && only.nodeType === Node.TEXT_NODE) only.nodeValue = text;
  else place.textContent = text;
}

/**
 * The game clock on the screen (checklist T3, T4; finding M1). It is read from the
 * SERVER's time (`now`), never the device's, four times a second while it runs, and
 * written straight into its place and into the minutes' places (`data-clock-time`,
 * `data-minutes-of`): nothing of the screen is drawn again for a tick, so a running
 * clock never makes a tile's tap wait. The screen is drawn again only when the clock
 * runs out, and `onRanOut` is then called once.
 *
 * Every tick writes whatever reads differently, the clock and each player's minutes
 * alike: a player's minutes turn over at their own moment of the second, not at the
 * clock's, so writing them only when the clock's text changed left them up to a second
 * behind (the code review of step 2.36). The clock's form, while nothing is typed in it,
 * shows the clock too (`data-clock-now`) and ticks with it. While the page is hidden the
 * timer is put down, and the clock is read the moment it is shown again
 * (clock-ticker.ts).
 */
function useGameClock(
  game: basketball.GameState,
  now: () => number,
  root: { readonly current: HTMLElement | null },
  view: ScoringView,
  t: Translate,
  onRanOut: () => void,
): ClockReading {
  const [, setRanOut] = useState<basketball.GameState | null>(null);
  // What the game holds of each player's minutes, as of its latest tap.
  const minutes = useMemo(() => {
    const held = new Map<string, { readonly ms: number; readonly onCourt: boolean }>();
    for (const side of basketball.SIDES) {
      for (const tile of [...view.teams[side].floor, ...view.teams[side].bench]) {
        held.set(tile.id, { ms: tile.ms, onCourt: tile.onCourt });
      }
    }
    return held;
  }, [view]);
  const paint = useCallback((): ClockReading => {
    const reading = readClock(game, now());
    const screen = root.current;
    if (screen === null) return reading;
    // `writeText` writes only what reads differently: between changes a tick looks for
    // these few places and touches nothing.
    for (const place of screen.querySelectorAll('[data-clock-time], [data-clock-now]')) {
      writeText(place, reading.text);
    }
    for (const place of screen.querySelectorAll<HTMLElement>('[data-minutes-of]')) {
      const held = minutes.get(place.dataset.minutesOf ?? '');
      if (held === undefined) continue;
      const text = minutesNow(game, reading, held.ms, held.onCourt);
      writeText(
        place,
        // In the pad the words after the minutes ("played") are drawn beside this place.
        place.hasAttribute('data-minutes-played')
          ? t('tracker.pad.who.minutesShort', { minutes: text })
          : text,
      );
    }
    return reading;
  }, [game, now, root, minutes, t]);
  // After every drawing: what was just drawn from the game's latest tap reads as of now.
  useLayoutEffect(() => {
    paint();
  });
  const ranOut = useRef(onRanOut);
  useLayoutEffect(() => {
    ranOut.current = onRanOut;
  });
  useEffect(() => {
    // A clock already at 0:00 when the game is shown ran out unseen: nothing is announced.
    if (!game.clock.running || !readClock(game, now()).running) return;
    const shown = () => document.visibilityState !== 'hidden';
    const ticker = createClockTicker(
      {
        paint: () => paint().running,
        ranOut: () => {
          setRanOut(game);
          ranOut.current();
        },
        every: (ms, run) => {
          const timer = window.setInterval(run, ms);
          return () => window.clearInterval(timer);
        },
      },
      shown(),
    );
    // Hidden (the phone locked, another app in front): the timer is put down. Shown
    // again: the clock is read at once, from the server's time, which the controller
    // carries on across a sleep; a period that ended meanwhile is said then.
    const onVisibility = () => ticker.shown(shown());
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      ticker.stop();
    };
  }, [game, now, paint]);
  return readClock(game, now());
}

export function ScoringScreen(props: ScoringScreenProps) {
  const { game, status, state, rosters, t, onNotRecorded } = props;
  const { controller } = game;
  const root = useRef<HTMLElement | null>(null);
  const [picks, setPicks] = useState<LineupPicks>(() => game.lineupPicks());
  const [padMode, setPadMode] = useState<PadMode>(padAtRest);
  const [said, setSaid] = useState<ReturnType<typeof clockSetSaid> | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  /** The whole play log, open over the screen (step 2.37). */
  const [logOpen, setLogOpen] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  // The marks of the tiles (tile-marks.ts): kept by player, so a tile drawn anew (a
  // substitution moves two players between floor and bench) is given its player's mark.
  const marks = useRef<TileMarks | null>(null);
  marks.current ??= createTileMarks(markTimers, (playerId) => tileElement(root.current, playerId));
  const tileMarks = marks.current;
  useLayoutEffect(() => tileMarks.redraw());
  // A tap the league refused takes its mark off at once, even while it still shows solid
  // (DESIGN.md §7, line 3): it never reads as a recorded play. The last few are kept.
  const markedTaps = useRef(new Map<string, TileMark>());
  const refusedByLeague = props.status.notApplied;
  useLayoutEffect(() => {
    const marked = markedTaps.current;
    for (const refused of refusedByLeague) {
      marked.get(refused.command.commandId)?.refused();
      marked.delete(refused.command.commandId);
    }
    for (const id of [...marked.keys()].slice(0, Math.max(marked.size - 20, 0))) {
      marked.delete(id);
    }
  }, [refusedByLeague]);
  /**
   * Marks a player's tile with what was tapped, now, as taken: written straight onto the
   * element, so it is painted in this turn whatever else the screen is working on. The
   * mark is told afterwards whether the tap was stored or not taken.
   */
  const markTile = (playerId: string, text: string, kind: MarkKind): TileMark =>
    tileMarks.show(playerId, text, kind);

  // The view holds each player's minutes as of the game's latest tap; the clock's ticker
  // writes them on from there, so the view is not worked out again as the clock runs.
  const view = useMemo(() => scoringView(state, rosters, picks), [state, rosters, picks]);
  // The Players panel (step 2.118): it reads the same rosters the tiles do.
  const players = usePlayersPanel({
    controller,
    status,
    state,
    rosters,
    t,
    banner: props.banner.text,
    draftsFor: {
      gameId: props.gameId ?? `${rosters.home.teamId}.${rosters.away.teamId}`,
      accountId: props.accountId,
    },
    onOpen: () => setMoreOpen(false),
  });
  // The options of a player the game no longer shows are not left open.
  const pad = padFor(view, padMode);
  // --- The clock (step 2.36). ---
  /** The form that sets the clock and picks the period: open or not, and what is typed. */
  const [clockOpen, setClockOpen] = useState(false);
  const [digits, setDigits] = useState('');
  /** The stop of the clock for which × hid the large Start clock button (T10). */
  const [startHiddenFor, setStartHiddenFor] = useState<string | null>(null);
  const horn = useRef<BonusHorn | null>(null);
  horn.current ??= createBonusHorn(browserHornAudio);
  const bonusHorn = horn.current;
  /**
   * What the pad is to show, as the taps so far leave it. It is known at once, a frame
   * before it is drawn (a tap is answered on its tile first), so a second tap made in
   * that frame is read against what the first one did, not against what is still drawn.
   */
  const wanted = useRef<PadMode>(padAtRest);
  const showPad = (mode: PadMode) => {
    wanted.current = mode;
    setPadMode(mode);
  };

  // The controls that rest for a moment (tap-rest.ts). Each is marked while it rests,
  // straight onto its element, so nothing of the screen is drawn again for it.
  const rests = useRef<Record<RestingPlace, TapRest> | null>(null);
  const drawRests = useCallback(() => {
    const [all, screen] = [rests.current, root.current];
    if (all === null || screen === null) return;
    for (const name of restingNames) {
      const resting = !all[name].ready();
      for (const place of screen.querySelectorAll(restingPlaces[name])) {
        place.toggleAttribute('data-resting', resting);
        // And a screen reader is told, on each button of it. Not on Undo and Redo: the
        // screen itself says when each has nothing to act on (`aria-disabled`), and a
        // key, which is how a screen reader presses, is always taken.
        if (name === 'undo' || name === 'redo') continue;
        const buttons = place.matches('button') ? [place] : place.querySelectorAll('button, a');
        for (const button of buttons) drawRest(button, resting);
      }
    }
  }, []);
  rests.current ??= {
    start: createTapRest(restTimers, drawRests),
    toggle: createTapRest(restTimers, drawRests),
    minus: createTapRest(restTimers, drawRests, takeBackRestMs),
    answers: createTapRest(restTimers, drawRests),
    undo: createTapRest(restTimers, drawRests, takeBackRestMs),
    redo: createTapRest(restTimers, drawRests, takeBackRestMs),
    asked: createTapRest(restTimers, drawRests),
    final: createTapRest(restTimers, drawRests, takeBackRestMs),
    mercy: createTapRest(restTimers, drawRests),
    undoAsked: createTapRest(restTimers, drawRests),
  };
  const resting = rests.current;
  // After every drawing: a control drawn anew while it rests is marked as well.
  useLayoutEffect(drawRests);
  useEffect(
    () => () => {
      for (const name of restingNames) resting[name].stop();
    },
    [resting],
  );

  const sayTimer = useRef<number | null>(null);
  const say = useCallback((text: ReturnType<typeof clockSetSaid>) => {
    if (sayTimer.current !== null) window.clearTimeout(sayTimer.current);
    setSaid(text);
    sayTimer.current = window.setTimeout(() => setSaid(null), saidForMs);
  }, []);
  useEffect(
    () => () => {
      if (sayTimer.current !== null) window.clearTimeout(sayTimer.current);
    },
    [],
  );

  /**
   * Hands a tap to the controller and gives its answer; a refusal is said in a sentence
   * (checklist I6). A tap that was taken comes back with the game as it stands with it.
   */
  const tap = useCallback(
    async (
      input: TapInput,
    ): Promise<
      | (Extract<TapResult, { ok: true }> & { readonly game: basketball.GameState | null })
      | { readonly ok: false }
    > => {
      const result = await controller.tap(input);
      if (result.ok) return { ...result, game: controller.status().game };
      // A final game the league has (the device no longer scores it, and this screen
      // stays with its final panel): nothing is recorded, and the screen says why (D12).
      if (result.reason === 'not-scoring' && controller.status().game?.status === 'final') {
        say(t('tracker.refusal.gameFinal'));
        return { ok: false };
      }
      // The device stopped scoring as the tap was made: this screen is about to be
      // taken away, so the page that replaces it is told, and says so there.
      if (result.reason === 'not-scoring') onNotRecorded?.();
      say(
        result.reason === 'engine'
          ? refusalText(result.message, t)
          : t(result.reason === 'storage' ? 'tracker.say.storage' : 'tracker.say.notScoring'),
      );
      return { ok: false };
    },
    [controller, say, t, onNotRecorded],
  );
  /** Sends a tap; says `saidWhenTaken` once it is taken. */
  const send = useCallback(
    async (input: TapInput, saidWhenTaken?: string): Promise<boolean> => {
      const result = await tap(input);
      if (result.ok && saidWhenTaken !== undefined) say(saidWhenTaken);
      return result.ok;
    },
    [tap, say],
  );

  // The clock as it reads now, from the server's time. When it runs out the screen says
  // "Halftime." or "End of Q1." (T4). No horn sounds then: the horn is the bonus horn.
  const reading = useGameClock(state, status.now, root, view, t, () => {
    const period = periodText(view.period, view.periods, t);
    say(
      periodEnd(view.period, view.periods) === 'halftime'
        ? t('tracker.say.halftime')
        : t('tracker.say.periodEnd', { period }),
    );
  });
  const lineupsSet = basketball.SIDES.every((side) => view.teams[side].stage === 'set');
  const startShown = startOffered(state, reading, {
    lineupsSet,
    period: view.period,
    hiddenFor: startHiddenFor,
  });
  const whyStopped = (reason: StopReason): string => {
    switch (reason.kind) {
      case 'tip-off':
        return t('tracker.start.reason.tipOff');
      case 'foul':
        return t('tracker.start.reason.foul', {
          player: playerLabel(findPlayer(rosters, reason.playerId), t),
        });
      case 'timeout':
        return t('tracker.start.reason.timeout', { team: view.teams[reason.side].name });
      case 'period-start':
        return t('tracker.start.reason.periodStart', {
          period: periodText(reason.period, view.periods, t),
        });
      case 'stopped':
        return t('tracker.start.reason.stopped');
    }
  };
  const clock: CourtClock = {
    text: reading.text,
    running: reading.running,
    over: reading.over,
    start: startShown
      ? { tipOff: state.status === 'scheduled', why: whyStopped(stopReason(state)) }
      : null,
    mode: clockModeShown(state, reading.remainingMs),
  };
  // The last-minutes stop clock begins while the clock runs: the screen is drawn again
  // then, so its sign shows and the switch reads Off from that moment (step 2.69).
  const [, setLastMinutesDrawn] = useState(0);
  const lastMinutesAtMs = clock.mode.lastMinutesAtMs;
  useEffect(() => {
    if (lastMinutesAtMs === null || !reading.running) return;
    const wait = reading.remainingMs - lastMinutesAtMs;
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setLastMinutesDrawn((n) => n + 1), wait + 20);
    return () => window.clearTimeout(timer);
  }, [lastMinutesAtMs, reading.running, reading.remainingMs]);
  // The mercy rule switched the clock to running: said until dismissed or switched back,
  // and not again for the same basket once dismissed (step 2.69), even after a reload: the
  // dismissal is kept on the device by game and person, as the Players panel's drafts are.
  const mercyOwner = {
    gameId: props.gameId ?? `${rosters.home.teamId}.${rosters.away.teamId}`,
    accountId: props.accountId,
  };
  const [mercyDismissed, setMercyDismissed] = useState<string | null>(() =>
    readMercyDismissed(deviceStore(), mercyOwner),
  );
  const mercy = mercySwitch(state, reading.remainingMs);
  const mercyShown = mercy !== null && mercyDismissal(mercy) !== mercyDismissed ? mercy : null;
  // In the same place (S-124): the running clock turned On then Off inside the last
  // minutes, so a stop clock for the rest of the game. Never with the mercy notice: that
  // one holds only on a running clock. Its dismissal is kept the same way.
  const stopForGame = lastMinutesStop(state);
  const stopForGameShown =
    stopForGame !== null && lastMinutesStopDismissal(stopForGame) !== mercyDismissed
      ? stopForGame
      : null;
  // Its answers rest from the moment it comes up (above, `restingPlaces.mercy`).
  // (The effect that begins it is below Undo's question, which makes the notice wait.)
  // Its words change as the last minutes begin: the answers rest again then too.
  const mercyShownId =
    mercyShown !== null
      ? mercyDismissal(mercyShown)
      : stopForGameShown !== null
        ? lastMinutesStopDismissal(stopForGameShown)
        : null;
  // Start or Pause under the scoreboard rests when its word changes, whatever changed it
  // (a tap kept by the device, a foul that stopped the clock, the clock running out): a
  // tap already on its way was meant for the word that was there.
  const toggleWord = reading.running ? 'pause' : reading.over ? 'over' : 'start';
  const toggleDrawn = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (toggleDrawn.current !== null && toggleDrawn.current !== toggleWord) resting.toggle.begin();
    toggleDrawn.current = toggleWord;
  }, [toggleWord, resting]);
  // The clock's form: a time longer than the period being played is not taken, and what
  // a time does to the players' minutes is the engine's own helper (game-clock.ts).
  const periodLengthMs = basketball.periodMs(state.rules, view.period);
  const entry = clockEntry(digits, periodLengthMs);
  const clockSheet: ClockSheet | null = clockOpen
    ? {
        entry,
        effect: entry.ms === null ? null : setEffect(state, entry.ms, status.now()),
        periodLength: basketball.formatClock(periodLengthMs),
        periods: periodChoices(state.rules, view.period),
      }
    : null;

  // The bonus horn (F4): when a foul puts a team in the bonus, one note (two for the
  // double bonus) and the sentence, since a muted tablet is the normal case. It sounds
  // for a foul recorded on any device: what is compared is the game as it is shown. A
  // game opened already in the bonus is silent, and so is going back to a period that
  // is already in the bonus: the badge shows, and the sentence about the period is what
  // is said (`bonusRises`, bonus-horn.ts). The horn's failure is its own affair.
  const bonusShown = useRef<BonusShown | null>(null);
  const [homeBonus, awayBonus] = [view.teams.home.bonus, view.teams.away.bonus];
  const [homeName, awayName] = [view.teams.home.name, view.teams.away.name];
  const bonusPeriod = view.period;
  useEffect(() => {
    const now = { home: homeBonus, away: awayBonus, period: bonusPeriod };
    const rises = bonusRises(bonusShown.current, now);
    bonusShown.current = now;
    if (rises.length === 0) return;
    bonusHorn.sound(rises.some((rise) => rise.level === 2) ? 2 : 1);
    say(
      rises
        .map((rise) =>
          t(`tracker.say.bonus.${rise.level}`, {
            team: rise.side === 'home' ? homeName : awayName,
          }),
        )
        .join(' '),
    );
  }, [homeBonus, awayBonus, bonusPeriod, homeName, awayName, bonusHorn, say, t]);

  // A team's fouls and its badge are never cut. On a device whose letters are wider than
  // most (some Android and Linux faces), "10F" and "Double bonus" can be wider than a
  // phone's box: the line is then marked, and the stylesheet sets it a size smaller.
  // Looked at when the fouls or a badge change and when the screen is turned, never in
  // the turn of a tap on a player.
  const foulsShown = `${view.teams.home.teamFouls}/${homeBonus}/${view.teams.away.teamFouls}/${awayBonus}`;
  useLayoutEffect(() => {
    const fit = () => {
      for (const line of root.current?.querySelectorAll<HTMLElement>('.court-score-fouls') ?? []) {
        line.removeAttribute('data-tight');
        if (line.scrollWidth > line.clientWidth) line.setAttribute('data-tight', '');
      }
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [foulsShown]);

  // The pad's Start clock button rests from the moment the pad comes to rest on the
  // screen, and is drawn not yet ready for as long (tap-rest.ts): a tap made then is the
  // second of two fast taps, meant for what was there a moment before. The button lies
  // where no option lies, and this is the second guard.
  const padKind = pad.kind;
  useLayoutEffect(() => {
    if (padKind === 'rest') resting.start.begin();
  }, [padKind, resting]);

  const keepPicks = useCallback(
    (next: LineupPicks) => {
      setPicks(next);
      void game.keepLineupPicks(next);
    },
    [game],
  );
  // The starters picked for a team are done with once its lineup is set: here (the
  // lineup tap was taken; until then they stay, so a refusal loses no tap) or on
  // another device. They are then forgotten on this device too.
  const homeSet = view.teams.home.stage === 'set' && picks.home.length > 0;
  const awaySet = view.teams.away.stage === 'set' && picks.away.length > 0;
  useEffect(() => {
    if (!homeSet && !awaySet) return;
    keepPicks({ home: homeSet ? [] : picks.home, away: awaySet ? [] : picks.away });
  }, [homeSet, awaySet, picks, keepPicks]);
  /** Players already told "out: recorded anyway", so it is said once for each. */
  const toldOut = useRef(new Set<string>());

  /** Where the keyboard goes next: back to a tile, or into the pad that just opened. */
  const focusNext = useRef<
    { readonly tile: string } | { readonly selector: string } | 'pad' | null
  >(null);
  useEffect(() => {
    const next = focusNext.current;
    if (next === null) return;
    focusNext.current = null;
    if (next === 'pad') {
      // The first point button, never a substitution: a second Enter must not swap players.
      root.current?.querySelector<HTMLElement>('[data-pad] [data-act="p1"]')?.focus();
    } else if ('selector' in next) {
      root.current?.querySelector<HTMLElement>(next.selector)?.focus();
    } else {
      tileElement(root.current, next.tile)?.focus();
    }
  });
  /** A click with no pointer behind it is Enter or Space (checklist S4). */
  const byKeyboard = (event: MouseEvent) => event.detail === 0;

  /** A final game takes no play: a tap on a player or a team's chip says so (D12). */
  const finalSays = (): boolean => {
    if (view.status !== 'final') return false;
    say(t('tracker.refusal.gameFinal'));
    return true;
  };
  const on: CourtHandlers = {
    tile(playerId, event) {
      if (finalSays()) return;
      const tapped = tapTile(view, picks, padFor(view, wanted.current), playerId);
      if (tapped === null) return;
      if (tapped.kind === 'pick') {
        keepPicks(tapped.picks);
        if (tapped.lineup !== null) void send(tapped.lineup);
        return;
      }
      const keyboard = byKeyboard(event);
      wanted.current = tapped.pad;
      // The tile is ringed at once; its options are drawn in the pad right after.
      if (tapped.pad.kind === 'player') ringTile(root.current, playerId);
      afterPaint(() => {
        unringTiles(root.current);
        setSaid(null);
        setPadMode(wanted.current);
        if (keyboard) focusNext.current = tapped.pad.kind === 'player' ? 'pad' : null;
      });
    },
    startShortHanded(side) {
      const lineup = startShortHanded(view, side);
      if (lineup !== null) void send(lineup);
    },
    action(tile, action, event) {
      // One option, once: the pad is this player's until the tap, and at rest from it,
      // so a second tap before the closed pad is drawn is not a play.
      if (!padIsFor(wanted.current, tile.id)) return;
      wanted.current = padAtRest;
      const input = padTap(tile, action);
      const name = playerLabel(tile.player, t);
      // Shown on the tile at once as taken, before the tap is stored (finding M6); it
      // is drawn as stored, or taken off, when the controller answers (tile-marks.ts).
      const text =
        input.type === 'score'
          ? t('tracker.pad.points', { points: input.points })
          : t(
              action === 'foul'
                ? 'tracker.pad.foul'
                : action === 'unfoul'
                  ? 'tracker.pad.unfoul'
                  : 'tracker.pad.turnover',
            );
      const kind = input.type === 'score' ? 'points' : action === 'foul' ? 'foul' : 'plain';
      const mark = markTile(tile.id, text, kind);
      // A foul may bring the bonus horn: a phone lets sound start only from a tap, so
      // the horn is made ready in this one (F4).
      if (action === 'foul') bonusHorn.ready();
      // A foul on a player already at the limit is recorded, and said once for each.
      const alreadyOut = action === 'foul' && tile.fouledOut && !toldOut.current.has(tile.id);
      if (alreadyOut) toldOut.current.add(tile.id);
      const bonusBefore = {
        home: view.teams.home.bonus,
        away: view.teams.away.bonus,
        period: view.period,
      };
      // The options close with the tap (D7). The mark is painted first; the tap is then
      // handed to the controller, which stores it before the tile counts it (T-114).
      const keyboard = byKeyboard(event);
      afterPaint(() => {
        setPadMode(wanted.current);
        if (keyboard) focusNext.current = { tile: tile.id };
        void tap(input).then((result) => {
          answerMarks([mark], result.ok);
          if (result.ok) markedTaps.current.set(result.commandId, mark);
          if (!result.ok) return;
          if (action === 'turnover') {
            say(t('tracker.say.turnover', { player: name }));
            return;
          }
          if (action !== 'foul' || result.game === null) return;
          // A foul that put the other team in the bonus is said as that, with the horn
          // (the effect above): nothing here is said over it.
          const after = basketball.derive(result.game);
          const bonusAfter = {
            home: after.teams.home.bonus,
            away: after.teams.away.bonus,
            period: after.period,
          };
          if (bonusRises(bonusBefore, bonusAfter).length > 0) return;
          if (alreadyOut) say(t('tracker.say.outRecorded', { player: name }));
          // On a running clock under a stop clock the foul stopped it: said, since it
          // changes what comes next (D8). The Start clock button then says why.
          else if (result.game.plays.find((p) => p.id === result.commandId)?.stoppedClock === true)
            say(t('tracker.say.foulStopped', { player: name }));
        });
      });
    },
    substitute(coming, going, event) {
      // Once, from the pad of either player, or from the bench opened for the one going.
      const now = wanted.current;
      const fromBench = now.kind === 'bench' && now.forId === going.id;
      if (!fromBench && !padIsFor(now, coming.id, going.id)) return;
      wanted.current = padAtRest;
      const marks = markSub(coming, going);
      const keyboard = byKeyboard(event);
      afterPaint(() => {
        setPadMode(wanted.current);
        if (keyboard) focusNext.current = { tile: coming.id };
        void send(subTap(coming, going)).then((taken) => answerMarks(marks, taken));
      });
    },
    closePad() {
      const open = pad.kind === 'player' ? pad.playerId : null;
      showPad(padAtRest);
      if (open !== null) focusNext.current = { tile: open };
    },
    turnovers(side) {
      if (finalSays()) return;
      const now = wanted.current;
      setSaid(null);
      showPad(
        now.kind === 'turnovers' && now.side === side ? padAtRest : { kind: 'turnovers', side },
      );
    },
    bench(side, forId) {
      if (finalSays()) return;
      const now = wanted.current;
      const open = now.kind === 'bench' && now.side === side && now.forId === forId;
      setSaid(null);
      showPad(open ? padAtRest : { kind: 'bench', side, forId });
    },
    benchPick(playerId, event) {
      const picked = pickFromBench(view, padFor(view, wanted.current), playerId);
      if (picked === null) return;
      if (picked.kind === 'sub') {
        on.substitute(picked.coming, picked.going, event);
      } else if (picked.kind === 'pad') {
        showPad(picked.pad);
        if (byKeyboard(event)) focusNext.current = 'pad';
      }
    },
    takeBackTurnover(tile) {
      void send({ type: 'unturnover', side: tile.side, playerId: tile.id });
    },
    teamTurnover(side) {
      void send(
        { type: 'team-turnover', side },
        t('tracker.say.teamTurnover', { team: view.teams[side].name }),
      );
    },
    takeBackTeamTurnover(side) {
      void send({ type: 'team-unturnover', side });
    },
    more(open) {
      setMoreOpen(open);
    },
    swapColors() {
      setMoreOpen(false);
      void send(swapColorsTap(state));
    },
    // --- The clock, periods and timeouts (step 2.36). ---
    startClock(event) {
      // The pad's large button waits a moment after the pad comes to rest; the button
      // under the scoreboard rests after a tap on it and after its word changes (the code
      // review, M-a), so the second tap of a double tap is not a tap on Pause.
      const input =
        event.currentTarget.closest('[data-pad]') !== null
          ? startBarTap(resting.start, tapOf(event))
          : clockToggleTap('start', resting.toggle, tapOf(event));
      if (input === null) return;
      // The first tap of a game is often this one: the horn is made ready for later.
      bonusHorn.ready();
      void send(input).finally(taken(event.currentTarget));
    },
    pauseClock(event) {
      const input = clockToggleTap('pause', resting.toggle, tapOf(event));
      if (input === null) return;
      void send(input).finally(taken(event.currentTarget));
    },
    periodOver() {
      say(t('tracker.refusal.periodOver'));
    },
    hideStart(event) {
      // × is where the pad's own × is: the second of two fast taps on that one hides nothing.
      if (!tapTaken(resting.start, tapOf(event))) return;
      setStartHiddenFor(stopKey(state, view.period));
      // Start is still one tap away, under the scoreboard: the keyboard goes there.
      focusNext.current = { selector: '[data-clock-toggle]' };
    },
    clockSheet(open) {
      setDigits('');
      setClockOpen(open);
    },
    clockKey(key) {
      setDigits((typed) =>
        key === 'clear' ? '' : key === 'back' ? typed.slice(0, -1) : clockEntryKey(typed, key),
      );
    },
    setClock() {
      const typed = clockEntry(digits, periodLengthMs);
      if (typed.ms === null) return;
      const before = readClock(state, status.now());
      setDigits('');
      setClockOpen(false);
      void tap({ type: 'set-clock', ms: typed.ms }).then((result) => {
        if (!result.ok || result.game === null) return;
        // What the engine truly did to the minutes: what came off, or what was added.
        say(clockSetSaid(t, typed.text, minutesMoved(state, before, result.game)));
      });
    },
    switchClock() {
      const input = switchedClock(clock.mode);
      setDigits('');
      setClockOpen(false);
      void send(input, t(`tracker.play.clock-mode.${input.mode}`));
    },
    pickPeriod(period) {
      setDigits('');
      setClockOpen(false);
      void send(
        { type: 'period', period },
        t('tracker.say.periodStart', {
          period: periodText(period, view.periods, t),
          clock: basketball.formatClock(basketball.periodMs(state.rules, period)),
        }),
      );
    },
    timeouts() {
      const open = wanted.current.kind === 'timeouts';
      setSaid(null);
      showPad(open ? padAtRest : { kind: 'timeouts', asking: null });
    },
    callTimeout(call, event) {
      const now = wanted.current;
      if (now.kind !== 'timeouts' || now.asking !== null) return;
      // A team with none of that length left is asked about first (G5). The answers rest
      // for a moment: the second of two fast taps on the timeout button is not an answer.
      if (timeoutTap(view, call).kind === 'ask') {
        resting.answers.begin(event.timeStamp);
        showPad({ kind: 'timeouts', asking: call });
        if (byKeyboard(event)) focusNext.current = { selector: '[data-pad] [data-answer="no"]' };
        return;
      }
      recordTimeout(call);
    },
    answerTimeout(record, event) {
      const now = wanted.current;
      if (now.kind !== 'timeouts' || now.asking === null) return;
      if (!tapTaken(resting.answers, tapOf(event))) return;
      if (record) recordTimeout(now.asking);
      else showPad({ kind: 'timeouts', asking: null });
    },
    takeBackTimeout(side, event) {
      // One at a time (the area 4 review, M2): − rests from each tap taken, so a fast
      // double tap takes one timeout back, never two.
      const input = takeBackTimeoutTap(side, resting.minus, tapOf(event));
      if (input === null) return;
      const team = view.teams[side].name;
      void tap(input).then((result) => {
        if (!result.ok) return;
        // The screen says which one came back: its period and its time.
        const back =
          result.game === null ? undefined : timeoutTakenBack(result.game, result.commandId);
        say(
          back === undefined
            ? t('tracker.say.untimeout', { team })
            : t('tracker.say.untimeoutOf', {
                team,
                period: periodText(back.period, view.periods, t),
                clock: basketball.formatClock(back.clockMs),
              }),
        );
      });
    },
    leave: leaveAsking,
  };

  /** Records a timeout; the list closes and the screen says it, and that the clock stopped (G6). */
  function recordTimeout(call: TimeoutCall) {
    showPad(padAtRest);
    const team = view.teams[call.side].name;
    void tap({ type: 'timeout', side: call.side, seconds: call.seconds }).then((result) => {
      if (!result.ok) return;
      const stopped =
        result.game?.plays.find((p) => p.id === result.commandId)?.stoppedClock === true;
      const length = call.seconds === 30 ? 'short' : 'full';
      say(t(`tracker.say.timeout.${length}${stopped ? 'Stopped' : ''}`, { team }));
    });
  }

  function markSub(coming: PlayerTile, going: PlayerTile) {
    return [
      markTile(going.id, t('tracker.mark.off'), 'plain'),
      markTile(coming.id, t('tracker.mark.on'), 'plain'),
    ];
  }

  // --- Undo, Redo and the play log (step 2.37; checklist I1 to I5). ---
  // What Undo and Redo will act on, named on the buttons; and the newest plays, worded
  // only as far as the screen shows them while the whole log is shut, so a tap in a long
  // game does not wait for every line of it (finding M6).
  const undoPlay = useMemo(() => undoTarget(state, rosters, t), [state, rosters, t]);
  const redoPlay = useMemo(() => redoTarget(state, rosters, t), [state, rosters, t]);
  const undoAsk = useUndoAsk(t, () => controller.status().game ?? state, status.corrections, {
    undo: resting.undo,
    answers: resting.undoAsked,
  });
  // Undo's question and the mercy notice never answer at once (step 2.65): while the
  // question is asked the notice waits, its place kept so nothing moves, and its answers
  // rest again when it comes back, so the tap that closed the question cannot land on one.
  const mercyWaits = undoAsk.ask !== null;
  useLayoutEffect(() => {
    if (!mercyWaits && mercyShownId !== null) resting.mercy.begin();
  }, [mercyWaits, mercyShownId, resting]);
  const { waiting } = status;
  const logHasPanel = useScreenIs(logPanelWhere);
  const noticesInPad = useScreenIs(uprightPhone);
  const rowsShown = logOpen ? undefined : logHasPanel ? panelRows : latestRows;
  const log = useMemo(
    () => playLog(state, rosters, waiting, t, rowsShown),
    [state, rosters, waiting, t, rowsShown],
  );
  /** What had the keyboard when the log was opened: it goes back there. */
  const logOpener = useRef<Element | null>(null);
  /**
   * Undo or Redo tapped. Greyed, it still says why (I6). Each rests from a tap taken, as
   * − on the timeouts does: one double tap takes one play back, never two. The sentence
   * says what happened, with what the scorekeeper would not see by itself (I2).
   */
  const turn = (kind: 'undo' | 'redo', event: MouseEvent<HTMLButtonElement>) => {
    const before = controller.status().game ?? state;
    if (before.status === 'final') return say(t('tracker.refusal.gameFinal'));
    const none = kind === 'undo' ? before.plays.length === 0 : before.redo.length === 0;
    if (none) {
      return say(
        t(kind === 'undo' ? 'tracker.refusal.nothingToUndo' : 'tracker.refusal.nothingToRedo'),
      );
    }
    if (!tapTaken(resting[kind], tapOf(event))) return;
    resting[kind].begin(event.timeStamp);
    // A foul brought back may bring the bonus horn: made ready in this tap (F4).
    if (kind === 'redo') bonusHorn.ready();
    void tap({ type: kind })
      .then((result) => {
        if (!result.ok) return;
        say(
          kind === 'redo'
            ? redoneText(before, rosters, t)
            : undoneText(before, result.game ?? before, rosters, t),
        );
      })
      .finally(taken(event.currentTarget));
  };
  const plays: PlaysHandlers = {
    undo: (event) => undoAsk.undo(event, (tap) => turn('undo', tap)),
    redo: (event) => turn('redo', event),
    playLog(open) {
      if (open) logOpener.current = document.activeElement;
      setMoreOpen(false);
      setLogOpen(open);
    },
  };

  // --- Ending the game (step 2.37; checklist J1 to J5): End game and its question, the
  // final panel, taking the End back, Reopen and Mark not started. What is asked and the
  // taps are use-end-game.ts's; the pad draws them (end-parts.tsx). ---
  const names = { home: view.teams.home.name, away: view.teams.away.name };
  /**
   * End game and Mark not started close More and ask in the pad. The second tap of a
   * double tap on either would land on whatever lay under the button (the clock, a
   * team's turnovers) and put that in the question's place: so for a third of a second
   * from the tap that closed More, a finger's tap anywhere on the screen is not taken.
   */
  const quietUntil = useRef(Number.NEGATIVE_INFINITY);
  const end = useEndGame({
    controller,
    status,
    state,
    names,
    allowTies: rosters.allowTies,
    mayCorrect: props.mayCorrect ?? false,
    offline: props.offline ?? false,
    t,
    reading: () => readClock(controller.status().game ?? state, status.now()),
    wanted,
    showPad,
    say,
    quiet: () => setSaid(null),
    tap,
    closeMore: (at) => {
      quietUntil.current = at + restMs;
      setMoreOpen(false);
    },
    focus: (selector) => {
      focusNext.current = { selector };
    },
    rests: resting,
    leave: leaveAsking,
    back: props.links.back,
  });

  /**
   * A way off the screen (the header's links, the final panel's "Back to the games"):
   * while anything waits to be sent it asks first, in the pad (lane 2.37, fix round,
   * F1), since what waits is sent only while this screen is open. The browser's own
   * leaving asks in its own words (tracker-opening.tsx, "beforeunload").
   */
  function leaveAsking(to: string) {
    return (event: MouseEvent<HTMLAnchorElement>) => {
      if (controller.status().waiting.length === 0) return props.leave(to)(event);
      event.preventDefault();
      if (wanted.current.kind === 'leave') return;
      // The answers rest from this tap: its double is not an answer.
      resting.asked.begin(event.timeStamp);
      // Asked from More, the question is in the pad under it: More closes, as it does for
      // each of its other buttons, so the question is seen (step 2.37, part 2).
      quietUntil.current = event.timeStamp + restMs;
      setMoreOpen(false);
      setSaid(null);
      showPad({ kind: 'leave', to });
      if (event.detail === 0) focusNext.current = { selector: '[data-pad] [data-answer="no"]' };
    };
  }
  const leaveAnswers = {
    stay(event: MouseEvent<HTMLElement>) {
      if (wanted.current.kind !== 'leave' || !tapTaken(resting.asked, tapOf(event))) return;
      // The final panel's buttons rest from this tap too: under "Stay here" lay "Back to
      // the games", and a slow double tap must not leave.
      resting.final.begin(event.timeStamp);
      showPad(padAtRest);
    },
    leave(event: MouseEvent<HTMLAnchorElement>) {
      const now = wanted.current;
      if (now.kind !== 'leave' || !tapTaken(resting.asked, tapOf(event))) {
        return event.preventDefault();
      }
      props.leave(now.to)(event);
    },
  };
  // The pad's own first line offers End game when the last period has run out with a
  // team ahead (S-65): offered, never done by itself.
  const endIsOffered = endOffered(state, reading.over);
  const padPanel = (() => {
    if (pad.kind === 'end') {
      return (
        <EndAsk
          t={t}
          question={endQuestion(state, names, rosters.allowTies, reading, t)}
          refused={pad.refused}
          working={end.working}
          on={end.on}
        />
      );
    }
    if (pad.kind === 'final' && end.ended !== null) {
      return (
        <FinalPanel
          t={t}
          won={wonText(state, names, t)}
          ended={end.ended}
          reopenLine={reopenLineText(end.reopenLine, t)}
          reopenOffered={reopenOffered(end.reopenLine)}
          problem={end.problemOn('final')}
          working={end.working}
          back={props.links.back}
          on={end.on}
        />
      );
    }
    if (pad.kind === 'leave') {
      return (
        <LeaveAsk
          t={t}
          final={state.status === 'final'}
          waiting={props.status.waiting.length}
          to={pad.to}
          on={leaveAnswers}
        />
      );
    }
    if (pad.kind === 'reopen') {
      return (
        <ReopenAsk
          t={t}
          reason={end.reopenReason}
          problem={end.problemOn('reopen')}
          working={end.working}
          on={end.on}
        />
      );
    }
    if (pad.kind === 'not-started') {
      const question = notStartedQuestion(state, names, props.mayCorrect ?? false, t);
      return (
        <NotStartedAsk
          t={t}
          question={question}
          askReason={question.kind === 'clears' || end.reasonAsked}
          reason={end.clearReason}
          problem={end.problemOn('not-started')}
          working={end.working}
          on={end.on}
        />
      );
    }
    return null;
  })();

  // --- More, the clock's form and the play log: each opened as a dialog; Escape closes
  // it, and the keyboard stays inside it. The keyboard returns to the button that opened
  // it: the play log has three (the pad's line, its own panel, More), so it goes back to
  // whichever had the keyboard, or to More when that one is gone with More's sheet. ---
  const dialog = clockOpen
    ? { sheet: '[data-clock-sheet] [role="dialog"]', opener: '[data-clock]' }
    : logOpen
      ? { sheet: '[data-play-log] [role="dialog"]', opener: '.court-more-button' }
      : moreOpen
        ? { sheet: '[data-more] [role="dialog"]', opener: '.court-more-button' }
        : null;
  const [dialogSheet, dialogOpener] = [dialog?.sheet ?? null, dialog?.opener ?? null];
  useEffect(() => {
    if (dialogSheet === null || dialogOpener === null) return;
    const screen = root.current;
    const sheet = screen?.querySelector<HTMLElement>(dialogSheet);
    sheet?.querySelector<HTMLElement>('button:not(:disabled), a[href]')?.focus();
    const isLog = dialogSheet.startsWith('[data-play-log]');
    return () => {
      const opener = isLog ? logOpener.current : null;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
      // A finger opened it (nothing had the keyboard): nothing is given it now.
      else if (!isLog || opener instanceof HTMLElement) {
        screen?.querySelector<HTMLElement>(dialogOpener)?.focus();
      }
    };
  }, [dialogSheet, dialogOpener]);

  // --- The keyboard: Escape closes the clock's form or More, then the open options,
  // then hides the Start clock button (checklist S4, T10). The clock's form takes the
  // number keys and Backspace wherever the keyboard is in it. ---
  const startBarShown = startShown && pad.kind === 'rest';
  const hideStartFor = stopKey(state, view.period);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab' && dialogSheet !== null) {
        const sheet = root.current?.querySelector<HTMLElement>(dialogSheet);
        const stops = [...(sheet?.querySelectorAll<HTMLElement>(dialogStops) ?? [])];
        const [first, last] = [stops[0], stops.at(-1)];
        if (first === undefined || last === undefined) return;
        const at = document.activeElement;
        if (event.shiftKey && (at === first || !sheet?.contains(at))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (at === last || !sheet?.contains(at))) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (clockOpen && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const key = /^\d$/.test(event.key)
          ? event.key
          : event.key === 'Backspace' || event.key === 'Delete'
            ? 'back'
            : null;
        if (key !== null) {
          event.preventDefault();
          setDigits((typed) => (key === 'back' ? typed.slice(0, -1) : clockEntryKey(typed, key)));
          return;
        }
      }
      if (event.key !== 'Escape') return;
      if (clockOpen) {
        setDigits('');
        setClockOpen(false);
        return;
      }
      if (logOpen) {
        setLogOpen(false);
        return;
      }
      if (moreOpen) {
        setMoreOpen(false);
        return;
      }
      const now = wanted.current;
      if (now.kind === 'rest') {
        if (!startBarShown) return;
        setStartHiddenFor(hideStartFor);
        focusNext.current = { selector: '[data-clock-toggle]' };
        return;
      }
      // "Record it anyway?" closed with Escape is "no": the timeouts stay open.
      if (now.kind === 'timeouts' && now.asking !== null) {
        wanted.current = { kind: 'timeouts', asking: null };
        setPadMode(wanted.current);
        return;
      }
      const open = now.kind === 'player' ? now.playerId : null;
      wanted.current = padAtRest;
      setPadMode(padAtRest);
      if (open !== null) focusNext.current = { tile: open };
      else root.current?.querySelector<HTMLElement>('[aria-expanded="true"]')?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [moreOpen, logOpen, clockOpen, dialogSheet, padMode, startBarShown, hideStartFor]);

  // --- Dragging a bench player onto a floor player (checklist E2, E3). ---
  // One press is followed at a time (tile-drag.ts): a second finger on another tile is
  // not, so two fingers can never make a substitution nobody made.
  const drag = useRef<TileDrag | null>(null);
  drag.current ??= createTileDrag();
  const pressed = drag.current;
  /** The tile the dragged player is over now. */
  const over = useRef<HTMLElement | null>(null);
  const ghost = useRef<HTMLDivElement | null>(null);
  /** The click that ends a drag is not a tap. */
  const swallowClick = useRef(false);

  const tileAt = (x: number, y: number): HTMLElement | null =>
    document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-teams] [data-player]') ?? null;
  const endDrag = () => {
    over.current?.removeAttribute('data-drop');
    over.current = null;
    setDragging(null);
  };
  // The window losing the focus (another app, a call) may swallow the lift: the press
  // ends there, recording nothing (the code look, L1).
  useEffect(() => {
    const onBlur = () => {
      if (!pressed.release()) return;
      over.current?.removeAttribute('data-drop');
      over.current = null;
      setDragging(null);
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [pressed]);
  const dragHandlers = {
    ref: root,
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (!(event.target instanceof Element)) return;
      const tile = event.target.closest<HTMLElement>('[data-teams] [data-player]');
      const playerId = tile?.dataset.player;
      if (playerId === undefined) return;
      const found = findTile(view, playerId);
      // Only once the lineup is set: while picking, a tile is tapped, never dragged.
      if (found === undefined || view.teams[found.side].stage !== 'set') return;
      // The same pointer pressing again: its lift never came. That press ends here.
      if (pressed.current()?.pointerId === event.pointerId) endDrag();
      pressed.down({
        pointerId: event.pointerId,
        isPrimary: event.isPrimary,
        button: event.button,
        playerId,
        x: event.clientX,
        y: event.clientY,
      });
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const at = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      const moved = pressed.move({ ...at, pointerType: event.pointerType, buttons: event.buttons });
      if (moved === 'ended') {
        // A mouse or pen with no button held: its lift never came. Nothing is recorded.
        endDrag();
        return;
      }
      if (moved === 'ignored' || moved === 'still') return;
      const dragged = pressed.current()?.playerId ?? null;
      if (moved === 'started') setDragging(dragged);
      if (ghost.current !== null) {
        ghost.current.style.transform = `translate(${at.x}px, ${at.y}px)`;
      }
      const under = tileAt(at.x, at.y);
      if (under !== over.current) {
        over.current?.removeAttribute('data-drop');
        if (under !== null && under.dataset.player !== dragged) under.setAttribute('data-drop', '');
        over.current = under;
      }
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      const now = pressed.up({
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      });
      if (now === null) return;
      endDrag();
      if (!now.moved) return;
      swallowClick.current = true;
      window.setTimeout(() => (swallowClick.current = false), 0);
      const dropped = dropOn(view, now.playerId, tileAt(now.x, now.y)?.dataset.player ?? null);
      if (dropped === null) return;
      if (dropped.kind === 'say') {
        say(t(dropped.key));
        return;
      }
      const coming = findTile(view, dropped.inId);
      const going = findTile(view, dropped.outId);
      const marks = coming !== undefined && going !== undefined ? markSub(coming, going) : [];
      showPad(padAtRest);
      void send(dropped.input).then((taken) => answerMarks(marks, taken));
    },
    onPointerCancel(event: PointerEvent<HTMLElement>) {
      if (pressed.cancel(event.pointerId)) endDrag();
    },
    /** The press no longer comes to this page (a finger's capture let go without a lift). */
    onLostPointerCapture(event: PointerEvent<HTMLElement>) {
      if (pressed.cancel(event.pointerId)) endDrag();
    },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      // The double of a tap that closed More for a question (see `quietUntil`).
      const double = event.detail !== 0 && event.timeStamp < quietUntil.current;
      if (!double && !swallowClick.current) return;
      swallowClick.current = false;
      event.stopPropagation();
      event.preventDefault();
    },
    /** A tap anywhere else closes a player's options (checklist D4). */
    onClick(event: MouseEvent<HTMLElement>) {
      if (wanted.current.kind !== 'player' || !(event.target instanceof Element)) return;
      if (
        event.target.closest(
          'button, a, [data-pad], [data-more], [data-play-log], [data-account]',
        ) !== null
      )
        return;
      showPad(padAtRest);
    },
  };

  // No bench player is hidden without a sign, and nothing scrolls sideways: a row that
  // holds one line of players (a phone's bench strip, the pad's "Sub in") shows as many
  // as fit whole and, when there are more, ends in a tile that says how many more and
  // opens them all in the pad. The players a line does not hold are marked, so the
  // stylesheet takes them out of the keyboard's way too (a focused thing that is cut
  // off would be scrolled to). Counted when a bench or the pad changes or the screen
  // is turned, never in the turn of a tap.
  const benches = (['home', 'away'] as const)
    .map((side) => `${view.teams[side].stage} ${view.teams[side].bench.map((p) => p.id).join(' ')}`)
    .join('|');
  useEffect(() => {
    const measure = () => {
      const rows = root.current?.querySelectorAll<HTMLElement>('[data-fit]') ?? [];
      for (const row of rows) {
        const style = getComputedStyle(row);
        const players = row.querySelectorAll(':scope > [data-player], :scope > [data-other]');
        const columns = style.gridTemplateColumns.split(' ').filter(Boolean).length;
        // The rows the stylesheet gives a height (one on an upright phone, two on a
        // phone lying down); the rows after them have none, and that is what says the
        // row holds only so many.
        const rowsHigh = style.gridTemplateRows
          .split(' ')
          .filter((size) => Number.parseFloat(size) > 0).length;
        const holds = columns * rowsHigh;
        const more =
          style.display === 'grid' && style.gridAutoRows === '0px' && players.length > holds
            ? players.length - (holds - 1)
            : 0;
        row.toggleAttribute('data-more', more > 0);
        // The end tile says it in words ("3 more"), from the message file: never "+3",
        // which sits beside the points buttons and reads as one.
        const end = row.querySelector(':scope > .court-more-tile');
        end?.setAttribute('data-count', String(more));
        const words = end?.querySelector('.court-more-count');
        if (words) words.textContent = more > 0 ? t.plural('tracker.bench.more', more) : '';
        players.forEach((player, place) =>
          player.toggleAttribute('data-folded', more > 0 && place >= holds - 1),
        );
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [benches, pad, t]);

  // The tiles are handed one tap handler that never changes, so a tile is drawn again
  // only when what it shows changed (finding M6).
  const latestTileTap = useRef(on.tile);
  useLayoutEffect(() => {
    latestTileTap.current = on.tile;
  });
  const tileTap = useCallback<CourtHandlers['tile']>(
    (playerId, event) => latestTileTap.current(playerId, event),
    [],
  );

  const draggedTile = dragging === null ? undefined : findTile(view, dragging);
  return (
    <CourtView
      t={t}
      view={view}
      title={props.title}
      when={props.when}
      clock={clock}
      clockSheet={clockSheet}
      banner={props.banner}
      notices={props.notices}
      padNotice={
        mercyShown === null ? (
          stopForGameShown === null ? null : mercyWaits ? (
            <div className="court-waits" data-mercy-waits="">
              <LastMinutesStopNotice t={t} seen={() => undefined} />
            </div>
          ) : (
            <LastMinutesStopNotice
              t={t}
              seen={(event) => {
                if (!tapTaken(resting.mercy, tapOf(event))) return;
                const kept = lastMinutesStopDismissal(stopForGameShown);
                writeMercyDismissed(deviceStore(), mercyOwner, kept);
                setMercyDismissed(kept);
              }}
            />
          )
        ) : mercyWaits ? (
          // Waiting behind Undo's question: in its place, out of sight and out of reach.
          <div className="court-waits" data-mercy-waits="">
            <MercyNotice t={t} mercy={mercyShown} back={() => undefined} keep={() => undefined} />
          </div>
        ) : (
          <MercyNotice
            t={t}
            mercy={mercyShown}
            back={(event) => {
              if (!tapTaken(resting.mercy, tapOf(event))) return;
              void send({ type: 'clock-mode', mode: 'stop' }, t('tracker.play.clock-mode.stop'));
            }}
            keep={(event) => {
              if (!tapTaken(resting.mercy, tapOf(event))) return;
              writeMercyDismissed(deviceStore(), mercyOwner, mercyDismissal(mercyShown));
              setMercyDismissed(mercyDismissal(mercyShown));
            }}
          />
        )
      }
      noticesIn={noticesInPad ? 'pad' : 'top'}
      turnovers={keepsTurnovers(props.rosters)}
      pad={pad}
      said={said}
      moreOpen={moreOpen}
      links={props.links}
      on={{ ...on, tile: tileTap }}
      drag={dragHandlers}
      slots={{
        ...props.slots,
        // After Start or Pause and the timeouts: Undo and Redo.
        controls: (
          <>
            <UndoRedo t={t} undo={undoPlay} redo={redoPlay} on={plays} />
            {undoAsk.ask}
            {props.slots?.controls}
          </>
        ),
        // The latest play, once the game is under way: before that the pad says what to
        // do before tip-off, and Undo itself names what it would take back (a lineup).
        padRest:
          state.status === 'live' && log.rows.length > 0 ? (
            <LatestPlays
              t={t}
              log={{ ...log, rows: log.rows.slice(0, latestRows) }}
              open={logOpen}
              on={plays}
            />
          ) : null,
        // The log's own panel, only where the stylesheet draws it.
        playLog: logHasPanel ? (
          <PlayLogPanel t={t} log={{ ...log, rows: log.rows.slice(0, panelRows) }} on={plays} />
        ) : null,
        // The last period has run out with a team ahead: the pad's first line is End game.
        padStart: endIsOffered ? (
          <EndOffer t={t} text={endOfferText(state, names, t)} on={end.on} />
        ) : null,
        padPanel,
        // Behind More: End game first, until the game is final; Mark not started while
        // it is live (a game that is or ever was final is never cleared: S-40).
        moreStart:
          state.status === 'final' ? (
            props.slots?.moreStart
          ) : (
            <>
              <MoreEnd t={t} on={end.on} />
              {props.slots?.moreStart}
            </>
          ),
        // The way to the Players panel: on a team with nobody, and behind More. Not in the
        // pad before tip-off: an upright phone has no room there for it and the pad's words.
        noPlayers: (side) => players.button(side),
        more: (
          <>
            {players.button('more')}
            <MoreLog t={t} log={log} on={plays} />
            {state.status === 'live' ? <MoreNotStarted t={t} on={end.on} /> : null}
            {props.slots?.more}
          </>
        ),
      }}
      account={props.account ?? null}
    >
      {logOpen ? <PlayLogSheet t={t} log={log} on={plays} /> : null}
      {players.sheet}
      {draggedTile === undefined ? null : (
        <div
          className="court-ghost"
          aria-hidden="true"
          data-color={view.teams[draggedTile.side].color}
          ref={(element) => {
            ghost.current = element;
            const at = pressed.current();
            if (element !== null && at !== null) {
              element.style.transform = `translate(${at.x}px, ${at.y}px)`;
            }
          }}
        >
          {playerLabel(draggedTile.player, t)}
        </div>
      )}
    </CourtView>
  );
}
