// One finger's drag of a player's tile (step 2.35; checklist E2), with no drawing: which
// press is being followed, whether it has moved far enough to be a drag, and what ends it.
// One press at a time: a second finger that lands while the first is down is not followed,
// and its moves and its lifting change nothing, so two fingers resting on two tiles can
// never make a substitution nobody made (the code review of 2.35, finding H1).

/** A press that moves less than this many pixels is a tap, not a drag. */
export const dragStartsAtPx = 8;

export type PointerAt = {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
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
  /** A press on a tile. False when it is not followed: another press is, or it is not the primary one. */
  down(press: PressOnTile): boolean;
  /**
   * The followed press moved: `started` the first time it is far enough to be a drag,
   * `dragging` after that, `still` while it is not; `ignored` for any other pointer.
   */
  move(at: PointerAt): 'ignored' | 'still' | 'started' | 'dragging';
  /** The followed press lifted: what it was, and nothing is followed any more. Null for any other pointer. */
  up(at: PointerAt): FollowedPress | null;
  /** The browser took the followed press away (a scroll, a call). False for any other pointer. */
  cancel(pointerId: number): boolean;
  /** The press being followed, or null. */
  current(): FollowedPress | null;
};

export function createTileDrag(): TileDrag {
  let followed: (FollowedPress & { readonly fromX: number; readonly fromY: number }) | null = null;
  return {
    down(press) {
      if (followed !== null || !press.isPrimary || press.button !== 0) return false;
      const { playerId, pointerId, x, y } = press;
      followed = { playerId, pointerId, x, y, fromX: x, fromY: y, moved: false };
      return true;
    },
    move(at) {
      if (followed === null || at.pointerId !== followed.pointerId) return 'ignored';
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
    current: () => followed,
  };
}
