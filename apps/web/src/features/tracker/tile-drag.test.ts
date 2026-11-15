// One press at a time (the code review of 2.35, finding H1): two fingers on two tiles
// never make a drag, and a press that barely moves is a tap (checklist E2).
import { describe, expect, it } from 'vitest';
import { createTileDrag, dragStartsAtPx } from './tile-drag.ts';

const finger = (pointerId: number, x: number, y: number) => ({ pointerId, x, y });
const press = (pointerId: number, playerId: string, x: number, y: number, isPrimary = true) => ({
  ...finger(pointerId, x, y),
  isPrimary,
  button: 0,
  playerId,
});

describe('dragging a player’s tile', () => {
  it('is a tap until the press has moved 8 pixels, then a drag that ends where it lifts', () => {
    const drag = createTileDrag();
    expect(drag.down(press(1, 'bench', 100, 100))).toBe(true);
    expect(drag.move(finger(1, 100 + dragStartsAtPx - 1, 100))).toBe('still');
    expect(drag.current()?.moved).toBe(false);
    expect(drag.move(finger(1, 100, 100 + dragStartsAtPx))).toBe('started');
    expect(drag.move(finger(1, 140, 60))).toBe('dragging');
    expect(drag.current()).toMatchObject({ playerId: 'bench', x: 140, y: 60, moved: true });
    expect(drag.up(finger(1, 150, 50))).toEqual({
      playerId: 'bench',
      pointerId: 1,
      x: 150,
      y: 50,
      moved: true,
    });
    expect(drag.current()).toBeNull();
    // Lifted without moving: a tap.
    drag.down(press(2, 'floor', 10, 10));
    expect(drag.up(finger(2, 12, 11))?.moved).toBe(false);
  });

  it('follows one finger only: a second finger on another tile changes nothing (H1)', () => {
    const drag = createTileDrag();
    // Finger A rests on a floor tile; finger B lands on a bench tile of the same team.
    expect(drag.down(press(1, 'floor', 50, 200))).toBe(true);
    expect(drag.down(press(2, 'bench', 300, 260, false))).toBe(false);
    // Even if the browser calls the second one primary (a pen beside a finger).
    expect(drag.down(press(2, 'bench', 300, 260, true))).toBe(false);
    expect(drag.current()?.playerId).toBe('floor');
    // B wanders and lifts: nothing.
    expect(drag.move(finger(2, 60, 205))).toBe('ignored');
    expect(drag.up(finger(2, 60, 205))).toBeNull();
    expect(drag.cancel(2)).toBe(false);
    expect(drag.current()).toMatchObject({ playerId: 'floor', moved: false });
    // A's own jitter is measured from where A went down, and A lifting is A's tap.
    expect(drag.move(finger(1, 52, 201))).toBe('still');
    expect(drag.up(finger(1, 52, 201))).toMatchObject({ playerId: 'floor', moved: false });
  });

  it('does not follow a press that is not the first finger or the main button', () => {
    const drag = createTileDrag();
    expect(drag.down(press(5, 'bench', 0, 0, false))).toBe(false);
    expect(drag.down({ ...press(1, 'bench', 0, 0), button: 2 })).toBe(false);
    expect(drag.current()).toBeNull();
    expect(drag.move(finger(1, 50, 50))).toBe('ignored');
  });

  it('lets go when the browser takes the press away, and follows the next one', () => {
    const drag = createTileDrag();
    drag.down(press(1, 'bench', 0, 0));
    drag.move(finger(1, 30, 0));
    expect(drag.cancel(1)).toBe(true);
    expect(drag.current()).toBeNull();
    expect(drag.up(finger(1, 30, 0))).toBeNull();
    expect(drag.down(press(3, 'other', 5, 5))).toBe(true);
  });
});
