'use client';
// The scoring screen on the device (step 2.35): it holds what is picked on the screen
// (the starters being tapped, whose options are open, what was last said) and sends every
// action to the controller that exists (tracker-controller.ts). It keeps no copy of the
// game: what is drawn is the controller's game, through scoring-view.ts.
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
import { CourtView, type CourtBanner, type CourtHandlers, type CourtSlots } from './court-view.tsx';
import { playerLabel, refusalText } from './engine-words.ts';
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
  type PadAction,
  type PadMode,
} from './scoring-moves.ts';
import { findTile, scoringView, type PlayerTile } from './scoring-view.ts';
import { createTileDrag, type TileDrag } from './tile-drag.ts';
import { createTileMarks, type MarkKind, type TileMark, type TileMarks } from './tile-marks.ts';
import type { TapInput, TrackerControllerStatus } from './tracker-controller.ts';

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

/** Server time, read once a second while the clock runs: the minutes on the tiles. */
function useElapsed(state: basketball.GameState, now: () => number): number {
  const read = useCallback(() => basketball.clockAt(state, now()).elapsedMs, [state, now]);
  const [elapsed, setElapsed] = useState(read);
  useEffect(() => {
    setElapsed(read());
    if (!state.clock.running) return;
    const timer = window.setInterval(() => setElapsed(read()), 1000);
    return () => window.clearInterval(timer);
  }, [read, state.clock.running]);
  return elapsed;
}

/** The game clock as it reads now, four times a second while it runs, from the server's time. */
function ClockTime({
  state,
  now,
}: {
  readonly state: basketball.GameState;
  readonly now: () => number;
}) {
  const read = useCallback(
    () => basketball.formatClock(basketball.clockAt(state, now()).remainingMs),
    [state, now],
  );
  const [text, setText] = useState(read);
  useEffect(() => {
    setText(read());
    if (!state.clock.running) return;
    const timer = window.setInterval(() => setText(read()), 250);
    return () => window.clearInterval(timer);
  }, [read, state.clock.running]);
  return text;
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

  const elapsed = useElapsed(state, status.now);
  const view = useMemo(
    () => scoringView(state, rosters, picks, elapsed),
    [state, rosters, picks, elapsed],
  );
  // The options of a player the game no longer shows are not left open.
  const pad = padFor(view, padMode);
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

  /** Sends a tap to the controller; a refusal is said in a sentence (checklist I6). */
  const send = useCallback(
    async (input: TapInput, saidWhenTaken?: string): Promise<boolean> => {
      const result = await controller.tap(input);
      if (result.ok) {
        if (saidWhenTaken !== undefined) say(saidWhenTaken);
        return true;
      }
      // The device stopped scoring as the tap was made: this screen is about to be
      // taken away, so the page that replaces it is told, and says so there.
      if (result.reason === 'not-scoring') onNotRecorded?.();
      say(
        result.reason === 'engine'
          ? refusalText(result.message, t)
          : t(result.reason === 'storage' ? 'tracker.say.storage' : 'tracker.say.notScoring'),
      );
      return false;
    },
    [controller, say, t, onNotRecorded],
  );

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
  const focusNext = useRef<{ readonly tile: string } | 'pad' | null>(null);
  useEffect(() => {
    const next = focusNext.current;
    if (next === null) return;
    focusNext.current = null;
    if (next === 'pad') {
      // The first point button, never a substitution: a second Enter must not swap players.
      root.current?.querySelector<HTMLElement>('[data-pad] [data-act="p1"]')?.focus();
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
      // A foul on a player already at the limit is recorded, and said once for each.
      const alreadyOut = action === 'foul' && tile.fouledOut && !toldOut.current.has(tile.id);
      if (alreadyOut) toldOut.current.add(tile.id);
      const saidWhenTaken =
        action === 'turnover'
          ? t('tracker.say.turnover', { player: name })
          : alreadyOut
            ? t('tracker.say.outRecorded', { player: name })
            : undefined;
      // The options close with the tap (D7). The mark is painted first; the tap is then
      // handed to the controller, which stores it before the tile counts it (T-114).
      const keyboard = byKeyboard(event);
      afterPaint(() => {
        setPadMode(wanted.current);
        if (keyboard) focusNext.current = { tile: tile.id };
        void send(input, saidWhenTaken).then((taken) => answerMarks([mark], taken));
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
    leave: props.leave,
  };

  function markSub(coming: PlayerTile, going: PlayerTile) {
    return [
      markTile(going.id, t('tracker.mark.off'), 'plain'),
      markTile(coming.id, t('tracker.mark.on'), 'plain'),
    ];
  }

  // --- More: opened as a dialog; Escape closes it, and the keyboard stays inside it. ---
  const moreButton = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!moreOpen) return;
    const sheet = root.current?.querySelector<HTMLElement>('[data-more] [role="dialog"]');
    moreButton.current = root.current?.querySelector<HTMLElement>('.court-more-button') ?? null;
    sheet?.querySelector<HTMLElement>('button, a[href]')?.focus();
    return () => moreButton.current?.focus();
  }, [moreOpen]);

  // --- The keyboard: Escape closes More, then the open options (checklist S4). ---
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab' && moreOpen) {
        const sheet = root.current?.querySelector<HTMLElement>('[data-more] [role="dialog"]');
        const stops = [...(sheet?.querySelectorAll<HTMLElement>('button, a[href]') ?? [])];
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
      if (event.key !== 'Escape') return;
      if (moreOpen) {
        setMoreOpen(false);
        return;
      }
      const now = wanted.current;
      if (now.kind === 'rest') return;
      const open = now.kind === 'player' ? now.playerId : null;
      wanted.current = padAtRest;
      setPadMode(padAtRest);
      if (open !== null) focusNext.current = { tile: open };
      else root.current?.querySelector<HTMLElement>('[aria-expanded="true"]')?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [moreOpen, padMode]);

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
      clock={<ClockTime state={state} now={status.now} />}
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
