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

export type MarkKind = 'points' | 'foul' | 'plain';

/** The part of an element the marks use. */
export type Markable = {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  getAttribute(name: string): string | null;
};

/** One mark on one tile, until its tap is answered. */
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
  /** Shows `text` on the tile as taken, in place of any mark it had. */
  show(tile: Markable, text: string, kind: MarkKind): TileMark;
};

/** How long a stored mark stays, and how long one waits for its answer. */
export const markStaysMs = 650;
export const markGivesUpMs = 4000;

export function createTileMarks(timers: MarkTimers): TileMarks {
  /** The latest mark of each tile, and the timer that will take it off. */
  const latest = new WeakMap<Markable, { readonly mark: object; cancel: () => void }>();
  const clear = (tile: Markable) => {
    tile.removeAttribute('data-mark');
    tile.removeAttribute('data-mark-kind');
    tile.removeAttribute('data-mark-state');
  };
  return {
    show(tile, text, kind) {
      latest.get(tile)?.cancel();
      const mark = {};
      const mine = () => latest.get(tile)?.mark === mark;
      const takeOff = () => {
        if (!mine()) return;
        latest.delete(tile);
        clear(tile);
      };
      tile.setAttribute('data-mark', text);
      tile.setAttribute('data-mark-kind', kind);
      tile.setAttribute('data-mark-state', 'taken');
      // The fade has two names, taken in turn, so it starts again on the next mark
      // without the screen having to be measured in between.
      tile.setAttribute('data-mark-turn', tile.getAttribute('data-mark-turn') === 'a' ? 'b' : 'a');
      latest.set(tile, { mark, cancel: timers.after(markGivesUpMs, takeOff) });
      return {
        stored() {
          const held = latest.get(tile);
          if (held === undefined || held.mark !== mark) return;
          held.cancel();
          tile.setAttribute('data-mark-state', 'stored');
          held.cancel = timers.after(markStaysMs, takeOff);
        },
        refused() {
          const held = latest.get(tile);
          if (held === undefined || held.mark !== mark) return;
          held.cancel();
          takeOff();
        },
      };
    },
  };
}
