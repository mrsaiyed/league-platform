// What a tile shows of a tap between the tap and its answer (step 2.35; finding M6 of the
// 2.107 audit; the code review of 2.35, finding M1). The mark is written straight onto the
// tile, so it is painted at once:
//
// - `taken`: the tap was made and is being recorded. Drawn hollow: it does not read as a
//   recorded play.
// - `stored`: the controller has stored the tap. Drawn solid, then it fades.
// - refused (the rules, the device's storage, the device no longer scoring): the mark is
//   taken off at once, in the same turn the refusal is said.
//
// A mark whose answer never comes is taken off after a few seconds. No drawing here: it
// sets attributes the stylesheet reads (`data-mark`, `-kind`, `-state`, `-turn`).
//
// A mark belongs to the player, not to the element their tile is drawn in (the code look,
// L2): a substitution moves both players between the floor and the bench, and the screen
// draws their tiles anew there. `redraw` writes every mark still showing onto the tile its
// player has now, so "On" stays with the player who came on and "Off" with the one who
// went off, hollow until stored, solid once stored.

export type MarkKind = 'points' | 'foul' | 'plain';

/** The part of an element the marks use. */
export type Markable = {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  getAttribute(name: string): string | null;
};

/** One mark on one player's tile, until its tap is answered. */
export type TileMark = {
  /** The tap is stored: the mark is drawn solid and fades. */
  stored(): void;
  /** The tap was not taken: the mark goes at once. */
  refused(): void;
};

export type MarkTimers = {
  /** Runs `run` once after `ms`; the function returned cancels it. */
  readonly after: (ms: number, run: () => void) => () => void;
};

export type TileMarks = {
  /** Shows `text` on the player's tile as taken, in place of any mark it had. */
  show(playerId: string, text: string, kind: MarkKind): TileMark;
  /** Writes each mark still showing onto the tile its player is drawn in now. */
  redraw(): void;
};

/** How long a stored mark stays, and how long one waits for its answer. */
export const markStaysMs = 650;
export const markGivesUpMs = 4000;

type Shown = {
  readonly mark: object;
  readonly text: string;
  readonly kind: MarkKind;
  state: 'taken' | 'stored';
  readonly turn: 'a' | 'b';
  cancel: () => void;
};

/**
 * The marks of the tiles that `tileOf` finds by player (null for a player whose tile is
 * not drawn: their mark is written once it is).
 */
export function createTileMarks(
  timers: MarkTimers,
  tileOf: (playerId: string) => Markable | null,
): TileMarks {
  /** The latest mark of each player. */
  const latest = new Map<string, Shown>();
  /** The fade's name each player's tile had last, so the next mark takes the other one. */
  const turns = new Map<string, 'a' | 'b'>();
  const write = (tile: Markable, shown: Shown) => {
    const set = (name: string, value: string) => {
      if (tile.getAttribute(name) !== value) tile.setAttribute(name, value);
    };
    set('data-mark', shown.text);
    set('data-mark-kind', shown.kind);
    set('data-mark-state', shown.state);
    set('data-mark-turn', shown.turn);
  };
  const clear = (tile: Markable) => {
    tile.removeAttribute('data-mark');
    tile.removeAttribute('data-mark-kind');
    tile.removeAttribute('data-mark-state');
  };
  return {
    show(playerId, text, kind) {
      latest.get(playerId)?.cancel();
      const mark = {};
      const mine = () => latest.get(playerId)?.mark === mark;
      const takeOff = () => {
        if (!mine()) return;
        latest.delete(playerId);
        const tile = tileOf(playerId);
        if (tile !== null) clear(tile);
      };
      // The fade has two names, taken in turn, so it starts again on the next mark
      // without the screen having to be measured in between.
      const turn = turns.get(playerId) === 'a' ? 'b' : 'a';
      turns.set(playerId, turn);
      const shown: Shown = { mark, text, kind, state: 'taken', turn, cancel: () => undefined };
      shown.cancel = timers.after(markGivesUpMs, takeOff);
      latest.set(playerId, shown);
      const tile = tileOf(playerId);
      if (tile !== null) write(tile, shown);
      return {
        stored() {
          if (!mine()) return;
          shown.cancel();
          shown.state = 'stored';
          const now = tileOf(playerId);
          if (now !== null) write(now, shown);
          shown.cancel = timers.after(markStaysMs, takeOff);
        },
        refused() {
          if (!mine()) return;
          shown.cancel();
          takeOff();
        },
      };
    },
    redraw() {
      for (const [playerId, shown] of latest) {
        const tile = tileOf(playerId);
        if (tile !== null) write(tile, shown);
      }
    },
  };
}
