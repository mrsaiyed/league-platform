// One finger's drag of a player's tile (step 2.35; checklist E2), with no drawing: which
// press is being followed, whether it has moved far enough to be a drag, and what ends it.
// One press at a time: a second finger that lands while the first is down is not followed,
// and its moves and its lifting change nothing, so two fingers resting on two tiles can
// never make a substitution nobody made (the code review of 2.35, finding H1). A press
// whose lift never comes (a mouse let go outside the window, the window losing the focus)
// is not followed for ever: it ends with nothing recorded (the code look, L1).

/** A press that moves less than this many pixels is a tap, not a drag. */
export const dragStartsAtPx = 8;

export type PointerAt = {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
};

/** A pointer that moved: also what it is, and which of its buttons are held. */
export type PointerMoved = PointerAt & {
  /** 'mouse', 'pen' or 'touch'. */
  readonly pointerType?: string;
  /** The buttons held now (0: none). */
  readonly buttons?: number;
};

export type PressOnTile = PointerAt & {
  /** The first finger down, or the mouse: the only kind of press that is followed. */
  readonly isPrimary: boolean;
  /** The main button (0 for a finger or a pen's tip). */
  readonly button: number;
  /** The player whose tile was pressed. */
  readonly playerId: string;
};

export type FollowedPress = {
  readonly playerId: string;
  readonly pointerId: number;
  /** Where it is now. */
  readonly x: number;
  readonly y: number;
  /** True once it has moved far enough to be a drag. */
  readonly moved: boolean;
};

export type TileDrag = {
  /**
   * A press on a tile. False when it is not followed: another press is, or it is not the
   * primary one. A press by the pointer already followed means that pointer's lift never
   * came (a mouse let go outside the window): the old press ends, recording nothing, and
   * this one is followed.
   */
  down(press: PressOnTile): boolean;
  /**
   * The followed press moved: `started` the first time it is far enough to be a drag,
   * `dragging` after that, `still` while it is not; `ignored` for any other pointer.
   * `ended` when a mouse or pen moves with no button held: its lift never came, and the
   * press ends with nothing recorded.
   */
  move(at: PointerMoved): 'ignored' | 'still' | 'started' | 'dragging' | 'ended';
  /** The followed press lifted: what it was, and nothing is followed any more. Null for any other pointer. */
  up(at: PointerAt): FollowedPress | null;
  /** The browser took the followed press away (a scroll, a call). False for any other pointer. */
  cancel(pointerId: number): boolean;
  /**
   * Whatever is followed ends, recording nothing: the window lost the focus, so no lift
   * may ever come. False when nothing was followed.
   */
  release(): boolean;
  /** The press being followed, or null. */
  current(): FollowedPress | null;
};

export function createTileDrag(): TileDrag {
  let followed: (FollowedPress & { readonly fromX: number; readonly fromY: number }) | null = null;
  return {
    down(press) {
      if (!press.isPrimary || press.button !== 0) return false;
      if (followed !== null && followed.pointerId !== press.pointerId) return false;
      const { playerId, pointerId, x, y } = press;
      followed = { playerId, pointerId, x, y, fromX: x, fromY: y, moved: false };
      return true;
    },
    move(at) {
      if (followed === null || at.pointerId !== followed.pointerId) return 'ignored';
      const heldBy = at.pointerType === 'mouse' || at.pointerType === 'pen';
      if (heldBy && at.buttons === 0) {
        followed = null;
        return 'ended';
      }
      const far = Math.hypot(at.x - followed.fromX, at.y - followed.fromY) >= dragStartsAtPx;
      if (!followed.moved && !far) return 'still';
      const started = !followed.moved;
      followed = { ...followed, x: at.x, y: at.y, moved: true };
      return started ? 'started' : 'dragging';
    },
    up(at) {
      if (followed === null || at.pointerId !== followed.pointerId) return null;
      const { playerId, pointerId, moved } = followed;
      followed = null;
      return { playerId, pointerId, x: at.x, y: at.y, moved };
    },
    cancel(pointerId) {
      if (followed === null || pointerId !== followed.pointerId) return false;
      followed = null;
      return true;
    },
    release() {
      const was = followed !== null;
      followed = null;
      return was;
    },
    current: () => followed,
  };
}
