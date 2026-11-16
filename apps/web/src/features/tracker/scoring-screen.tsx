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
import type { ClockSheet, CourtClock } from './clock-parts.tsx';
import { CourtView, type CourtBanner, type CourtHandlers, type CourtSlots } from './court-view.tsx';
import { findPlayer, periodText, playerLabel, refusalText } from './engine-words.ts';
import {
  clockEntry,
  clockEntryKey,
  minutesBack,
  minutesNow,
  periodChoices,
  periodEnd,
  readClock,
  startOffered,
  stopKey,
  stopReason,
  type ClockReading,
  type StopReason,
} from './game-clock.ts';
import type { OpenedTrackerGame } from './open-tracker-game.ts';
import type { DeviceRosters, LineupPicks } from './opened-game-storage.ts';
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
  takeBackTimeoutTap,
  tapTaken,
  type RestTimers,
  type Tap,
  type TapRest,
} from './tap-rest.ts';
import { createTileDrag, type TileDrag } from './tile-drag.ts';
import { createTileMarks, type MarkKind, type TileMark, type TileMarks } from './tile-marks.ts';
import type { TapInput, TapResult, TrackerControllerStatus } from './tracker-controller.ts';

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
};

/** How long the latest sentence stays (checklist I5). */
const saidForMs = 3200;

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
  /** Start or Pause under the scoreboard, after a tap on it and after its word changes. */
  toggle: '[data-clock-toggle]',
  /** − on a team's timeouts, after a take-back (the area 4 review, M2). */
  minus: '[data-pad] [data-act="untimeout"]',
  /** The answers to "Record it anyway?", after the question is asked. */
  answers: '[data-pad] [data-timeout-answers]',
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

/** How long the large Start clock button takes no tap once the pad has come to rest. */
const restGuardMs = 350;
/** How often the running clock is read (checklist T3: four times a second). */
const tickMs = 250;

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
  const painted = useRef<{ game: basketball.GameState; text: string } | null>(null);
  const paint = useCallback(
    (all: boolean): ClockReading => {
      const reading = readClock(game, now());
      const last = painted.current;
      // Between seconds nothing reads differently: nothing is looked for, nothing written.
      if (!all && last !== null && last.game === game && last.text === reading.text) {
        return reading;
      }
      painted.current = { game, text: reading.text };
      const screen = root.current;
      if (screen === null) return reading;
      writeText(screen.querySelector('[data-clock-time]'), reading.text);
      for (const place of screen.querySelectorAll<HTMLElement>('[data-minutes-of]')) {
        const held = minutes.get(place.dataset.minutesOf ?? '');
        if (held === undefined) continue;
        const text = minutesNow(game, reading, held.ms, held.onCourt);
        writeText(
          place,
          place.hasAttribute('data-minutes-played')
            ? t('tracker.pad.who.minutes', { minutes: text })
            : text,
        );
      }
      return reading;
    },
    [game, now, root, minutes, t],
  );
  // After every drawing: what was just drawn from the game's latest tap reads as of now.
  useLayoutEffect(() => {
    paint(true);
  });
  const ranOut = useRef(onRanOut);
  useLayoutEffect(() => {
    ranOut.current = onRanOut;
  });
  useEffect(() => {
    // A clock already at 0:00 when the game is shown ran out unseen: nothing is announced.
    if (!game.clock.running || !readClock(game, now()).running) return;
    const timer = window.setInterval(() => {
      if (paint(false).running) return;
      window.clearInterval(timer);
      setRanOut(game);
      ranOut.current();
    }, tickMs);
    return () => window.clearInterval(timer);
  }, [game, now, paint]);
  return readClock(game, now());
}

export function ScoringScreen(props: ScoringScreenProps) {
  const { game, status, state, rosters, t, onNotRecorded } = props;
  const { controller } = game;
  const root = useRef<HTMLElement | null>(null);
  const [picks, setPicks] = useState<LineupPicks>(() => game.lineupPicks());
  const [padMode, setPadMode] = useState<PadMode>(padAtRest);
  const [said, setSaid] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  // The marks of the tiles (tile-marks.ts): kept by player, so a tile drawn anew (a
  // substitution moves two players between floor and bench) is given its player's mark.
  const marks = useRef<TileMarks | null>(null);
  marks.current ??= createTileMarks(markTimers, (playerId) => tileElement(root.current, playerId));
  const tileMarks = marks.current;
  useLayoutEffect(() => tileMarks.redraw());
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
      }
    }
  }, []);
  rests.current ??= {
    toggle: createTapRest(restTimers, drawRests),
    minus: createTapRest(restTimers, drawRests),
    answers: createTapRest(restTimers, drawRests),
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
  const say = useCallback((text: string) => {
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
  };
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
  // a time takes off the players' minutes is the engine's own figure (game-clock.ts).
  const periodLengthMs = basketball.periodMs(state.rules, view.period);
  const entry = clockEntry(digits, periodLengthMs);
  const back = entry.ms === null ? null : minutesBack(state, reading, entry.ms);
  const clockSheet: ClockSheet | null = clockOpen
    ? {
        entry,
        minutesBack:
          back !== null && back.ms > 0
            ? { back: basketball.formatClock(back.ms), wholePeriod: back.wholePeriod }
            : null,
        periodLength: basketball.formatClock(periodLengthMs),
        periods: periodChoices(state.rules, view.period),
      }
    : null;

  // The bonus horn (F4): when a team's bonus rises, one note (two for the double bonus)
  // and the sentence, since a muted tablet is the normal case. A game opened already in
  // the bonus is silent. The horn's failure is its own affair (bonus-horn.ts).
  const bonusShown = useRef<BonusShown | null>(null);
  const [homeBonus, awayBonus] = [view.teams.home.bonus, view.teams.away.bonus];
  const [homeName, awayName] = [view.teams.home.name, view.teams.away.name];
  useEffect(() => {
    const now = { home: homeBonus, away: awayBonus };
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
  }, [homeBonus, awayBonus, homeName, awayName, bonusHorn, say, t]);

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

  /** When the pad last came to rest on the screen: the Start clock button waits a moment. */
  const restSince = useRef(0);
  const padKind = pad.kind;
  useLayoutEffect(() => {
    if (padKind === 'rest') restSince.current = performance.now();
  }, [padKind]);
  /**
   * True for a tap on the pad's Start clock button made as the pad came to rest: the
   * second of two fast taps, meant for what was there a moment before. It lies where no
   * option lies, and this is the second guard.
   */
  const tooSoonAfterRest = (event: MouseEvent): boolean =>
    event.detail !== 0 &&
    event.currentTarget.closest('[data-pad]') !== null &&
    event.timeStamp - restSince.current < restGuardMs;

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

  const on: CourtHandlers = {
    tile(playerId, event) {
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
      const bonusBefore = { home: view.teams.home.bonus, away: view.teams.away.bonus };
      // The options close with the tap (D7). The mark is painted first; the tap is then
      // handed to the controller, which stores it before the tile counts it (T-114).
      const keyboard = byKeyboard(event);
      afterPaint(() => {
        setPadMode(wanted.current);
        if (keyboard) focusNext.current = { tile: tile.id };
        void tap(input).then((result) => {
          answerMarks([mark], result.ok);
          if (!result.ok) return;
          if (action === 'turnover') {
            say(t('tracker.say.turnover', { player: name }));
            return;
          }
          if (action !== 'foul' || result.game === null) return;
          // A foul that put the other team in the bonus is said as that, with the horn
          // (the effect above): nothing here is said over it.
          const teams = basketball.derive(result.game).teams;
          if (
            bonusRises(bonusBefore, { home: teams.home.bonus, away: teams.away.bonus }).length > 0
          )
            return;
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
      const now = wanted.current;
      setSaid(null);
      showPad(
        now.kind === 'turnovers' && now.side === side ? padAtRest : { kind: 'turnovers', side },
      );
    },
    bench(side, forId) {
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
          ? tooSoonAfterRest(event)
            ? null
            : ({ type: 'start' } as const)
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
      if (tooSoonAfterRest(event)) return;
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
        // What the engine really took off the minutes: time put back on, within the period.
        const tookOff = before.elapsedMs - result.game.clock.elapsedMs;
        say(
          tookOff > 0
            ? t('tracker.say.clockSetBack', {
                clock: typed.text,
                back: basketball.formatClock(tookOff),
              })
            : t('tracker.say.clockSet', { clock: typed.text }),
        );
      });
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
    leave: props.leave,
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

  // --- More, and the clock's form: each opened as a dialog; Escape closes it, and the
  // keyboard stays inside it. The keyboard returns to the button that opened it. ---
  const dialog = clockOpen
    ? { sheet: '[data-clock-sheet] [role="dialog"]', opener: '[data-clock]' }
    : moreOpen
      ? { sheet: '[data-more] [role="dialog"]', opener: '.court-more-button' }
      : null;
  const [dialogSheet, dialogOpener] = [dialog?.sheet ?? null, dialog?.opener ?? null];
  useEffect(() => {
    if (dialogSheet === null || dialogOpener === null) return;
    const screen = root.current;
    const sheet = screen?.querySelector<HTMLElement>(dialogSheet);
    sheet?.querySelector<HTMLElement>('button:not(:disabled), a[href]')?.focus();
    return () => screen?.querySelector<HTMLElement>(dialogOpener)?.focus();
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
        const stops = [
          ...(sheet?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') ?? []),
        ];
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
  }, [moreOpen, clockOpen, dialogSheet, padMode, startBarShown, hideStartFor]);

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
      if (!swallowClick.current) return;
      swallowClick.current = false;
      event.stopPropagation();
      event.preventDefault();
    },
    /** A tap anywhere else closes a player's options (checklist D4). */
    onClick(event: MouseEvent<HTMLElement>) {
      if (wanted.current.kind !== 'player' || !(event.target instanceof Element)) return;
      if (event.target.closest('button, a, [data-pad], [data-more], [data-account]') !== null)
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
      pad={pad}
      said={said}
      moreOpen={moreOpen}
      links={props.links}
      on={{ ...on, tile: tileTap }}
      drag={dragHandlers}
      {...(props.slots === undefined ? {} : { slots: props.slots })}
      account={props.account ?? null}
    >
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
