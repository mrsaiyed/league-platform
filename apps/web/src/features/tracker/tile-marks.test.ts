// A tile's mark between a tap and its answer (the code review of 2.35, finding M1): hollow
// while the tap is being recorded, solid once stored, gone at once when it was not taken.
import { describe, expect, it } from 'vitest';
import { createTileMarks, markGivesUpMs, markStaysMs, type Markable } from './tile-marks.ts';

function fakeTile(): Markable & { readonly attributes: Map<string, string> } {
  const attributes = new Map<string, string>();
  return {
    attributes,
    setAttribute: (name, value) => void attributes.set(name, value),
    removeAttribute: (name) => void attributes.delete(name),
    getAttribute: (name) => attributes.get(name) ?? null,
  };
}

function fakeTimers() {
  let now = 0;
  const waiting: { at: number; run: () => void; live: boolean }[] = [];
  return {
    after(ms: number, run: () => void) {
      const timer = { at: now + ms, run, live: true };
      waiting.push(timer);
      return () => {
        timer.live = false;
      };
    },
    advance(ms: number) {
      now += ms;
      for (const timer of waiting) {
        if (timer.live && timer.at <= now) {
          timer.live = false;
          timer.run();
        }
      }
    },
  };
}

const shown = (tile: ReturnType<typeof fakeTile>) => ({
  mark: tile.attributes.get('data-mark'),
  kind: tile.attributes.get('data-mark-kind'),
  state: tile.attributes.get('data-mark-state'),
});

describe('what a tile shows of a tap', () => {
  it('shows it at once as taken, solid once stored, then takes it off', () => {
    const timers = fakeTimers();
    const tile = fakeTile();
    const mark = createTileMarks(timers).show(tile, '+2', 'points');
    expect(shown(tile)).toEqual({ mark: '+2', kind: 'points', state: 'taken' });
    timers.advance(300);
    mark.stored();
    expect(shown(tile).state).toBe('stored');
    timers.advance(markStaysMs - 1);
    expect(shown(tile).mark).toBe('+2');
    timers.advance(1);
    expect(shown(tile)).toEqual({ mark: undefined, kind: undefined, state: undefined });
  });

  it('takes the mark off at once when the tap was not taken', () => {
    const timers = fakeTimers();
    const tile = fakeTile();
    const mark = createTileMarks(timers).show(tile, 'Foul', 'foul');
    mark.refused();
    expect(shown(tile).mark).toBeUndefined();
    // An answer that comes twice, or late, changes nothing.
    mark.stored();
    expect(shown(tile).mark).toBeUndefined();
  });

  it('never leaves a mark whose answer does not come', () => {
    const timers = fakeTimers();
    const tile = fakeTile();
    createTileMarks(timers).show(tile, '+3', 'points');
    timers.advance(markGivesUpMs - 1);
    expect(shown(tile).state).toBe('taken');
    timers.advance(1);
    expect(shown(tile).mark).toBeUndefined();
  });

  it('a second tap on the tile replaces the first mark, whose answer no longer touches it', () => {
    const timers = fakeTimers();
    const tile = fakeTile();
    const marks = createTileMarks(timers);
    const first = marks.show(tile, '+2', 'points');
    const turn = tile.attributes.get('data-mark-turn');
    const second = marks.show(tile, 'Foul', 'foul');
    // The fade starts again: its name changes.
    expect(tile.attributes.get('data-mark-turn')).not.toBe(turn);
    first.refused();
    expect(shown(tile)).toEqual({ mark: 'Foul', kind: 'foul', state: 'taken' });
    first.stored();
    expect(shown(tile).state).toBe('taken');
    // The first mark's timers are done with: only the second one's answer counts.
    timers.advance(markGivesUpMs - 1);
    second.stored();
    timers.advance(markStaysMs);
    expect(shown(tile).mark).toBeUndefined();
  });

  it('marks two tiles apart (a substitution)', () => {
    const timers = fakeTimers();
    const [coming, going] = [fakeTile(), fakeTile()];
    const marks = createTileMarks(timers);
    const on = marks.show(coming, 'On', 'plain');
    const off = marks.show(going, 'Off', 'plain');
    on.refused();
    expect(shown(coming).mark).toBeUndefined();
    expect(shown(going).mark).toBe('Off');
    off.refused();
    expect(shown(going).mark).toBeUndefined();
  });
});
