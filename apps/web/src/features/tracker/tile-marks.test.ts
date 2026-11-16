// A tile's mark between a tap and its answer (the code review of 2.35, finding M1): hollow
// while the tap is being recorded, solid once stored, gone at once when it was not taken.
// And it belongs to the player, whatever element their tile is drawn in (the code look, L2).
import { describe, expect, it } from 'vitest';
import { createTileMarks, markGivesUpMs, markStaysMs, type Markable } from './tile-marks.ts';

type FakeTile = Markable & { readonly attributes: Map<string, string> };

function fakeTile(): FakeTile {
  const attributes = new Map<string, string>();
  return {
    attributes,
    setAttribute: (name, value) => void attributes.set(name, value),
    removeAttribute: (name) => void attributes.delete(name),
    getAttribute: (name) => attributes.get(name) ?? null,
  };
}

/** The tiles drawn now, by player: a tile drawn anew is a new element. */
function fakeScreen(...players: string[]) {
  const tiles = new Map<string, FakeTile>(players.map((id) => [id, fakeTile()]));
  return {
    tileOf: (id: string) => tiles.get(id) ?? null,
    tile(id: string): FakeTile {
      const found = tiles.get(id);
      if (found === undefined) throw new Error(`no tile for ${id}`);
      return found;
    },
    drawAnew(id: string) {
      tiles.set(id, fakeTile());
    },
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

const shown = (tile: FakeTile) => ({
  mark: tile.attributes.get('data-mark'),
  kind: tile.attributes.get('data-mark-kind'),
  state: tile.attributes.get('data-mark-state'),
});

describe('what a tile shows of a tap', () => {
  it('shows it at once as taken, solid once stored, then takes it off', () => {
    const timers = fakeTimers();
    const screen = fakeScreen('p');
    const mark = createTileMarks(timers, screen.tileOf).show('p', '+2', 'points');
    expect(shown(screen.tile('p'))).toEqual({ mark: '+2', kind: 'points', state: 'taken' });
    timers.advance(300);
    mark.stored();
    expect(shown(screen.tile('p')).state).toBe('stored');
    timers.advance(markStaysMs - 1);
    expect(shown(screen.tile('p')).mark).toBe('+2');
    timers.advance(1);
    expect(shown(screen.tile('p'))).toEqual({ mark: undefined, kind: undefined, state: undefined });
  });

  it('takes the mark off at once when the tap was not taken', () => {
    const timers = fakeTimers();
    const screen = fakeScreen('p');
    const mark = createTileMarks(timers, screen.tileOf).show('p', 'Foul', 'foul');
    mark.refused();
    expect(shown(screen.tile('p')).mark).toBeUndefined();
    // An answer that comes twice, or late, changes nothing.
    mark.stored();
    expect(shown(screen.tile('p')).mark).toBeUndefined();
  });

  it('never leaves a mark whose answer does not come', () => {
    const timers = fakeTimers();
    const screen = fakeScreen('p');
    createTileMarks(timers, screen.tileOf).show('p', '+3', 'points');
    timers.advance(markGivesUpMs - 1);
    expect(shown(screen.tile('p')).state).toBe('taken');
    timers.advance(1);
    expect(shown(screen.tile('p')).mark).toBeUndefined();
  });

  it('a second tap on the tile replaces the first mark, whose answer no longer touches it', () => {
    const timers = fakeTimers();
    const screen = fakeScreen('p');
    const marks = createTileMarks(timers, screen.tileOf);
    const first = marks.show('p', '+2', 'points');
    const turn = screen.tile('p').attributes.get('data-mark-turn');
    const second = marks.show('p', 'Foul', 'foul');
    // The fade starts again: its name changes.
    expect(screen.tile('p').attributes.get('data-mark-turn')).not.toBe(turn);
    first.refused();
    expect(shown(screen.tile('p'))).toEqual({ mark: 'Foul', kind: 'foul', state: 'taken' });
    first.stored();
    expect(shown(screen.tile('p')).state).toBe('taken');
    // The first mark's timers are done with: only the second one's answer counts.
    timers.advance(markGivesUpMs - 1);
    second.stored();
    timers.advance(markStaysMs);
    expect(shown(screen.tile('p')).mark).toBeUndefined();
  });

  it('marks two tiles apart (a substitution)', () => {
    const timers = fakeTimers();
    const screen = fakeScreen('coming', 'going');
    const marks = createTileMarks(timers, screen.tileOf);
    const on = marks.show('coming', 'On', 'plain');
    const off = marks.show('going', 'Off', 'plain');
    on.refused();
    expect(shown(screen.tile('coming')).mark).toBeUndefined();
    expect(shown(screen.tile('going')).mark).toBe('Off');
    off.refused();
    expect(shown(screen.tile('going')).mark).toBeUndefined();
  });
});

describe('a mark belongs to the player, not to the element (the code look, L2)', () => {
  it('a substitution stored: "On" and "Off" are on the two players’ new tiles, solid', () => {
    const timers = fakeTimers();
    const screen = fakeScreen('coming', 'going');
    const marks = createTileMarks(timers, screen.tileOf);
    const on = marks.show('coming', 'On', 'plain');
    const off = marks.show('going', 'Off', 'plain');
    // Stored, and the two are drawn anew: the bench player now on the floor, and the
    // floor player now on the bench. The screen redraws the marks after drawing.
    on.stored();
    off.stored();
    screen.drawAnew('coming');
    screen.drawAnew('going');
    expect(shown(screen.tile('coming')).mark).toBeUndefined();
    marks.redraw();
    expect(shown(screen.tile('coming'))).toEqual({ mark: 'On', kind: 'plain', state: 'stored' });
    expect(shown(screen.tile('going'))).toEqual({ mark: 'Off', kind: 'plain', state: 'stored' });
    // And they fade from the new tiles as stored marks do.
    timers.advance(markStaysMs);
    expect(shown(screen.tile('coming')).mark).toBeUndefined();
    expect(shown(screen.tile('going')).mark).toBeUndefined();
    marks.redraw();
    expect(shown(screen.tile('coming')).mark).toBeUndefined();
  });

  it('drawn anew before the answer: hollow on the new tile, then solid, or gone when refused', () => {
    const timers = fakeTimers();
    const screen = fakeScreen('coming', 'going');
    const marks = createTileMarks(timers, screen.tileOf);
    const on = marks.show('coming', 'On', 'plain');
    const off = marks.show('going', 'Off', 'plain');
    screen.drawAnew('coming');
    screen.drawAnew('going');
    marks.redraw();
    expect(shown(screen.tile('coming')).state).toBe('taken');
    on.stored();
    expect(shown(screen.tile('coming')).state).toBe('stored');
    off.refused();
    expect(shown(screen.tile('going')).mark).toBeUndefined();
    marks.redraw();
    expect(shown(screen.tile('going')).mark).toBeUndefined();
  });

  it('a player whose tile is not drawn is marked once it is', () => {
    const timers = fakeTimers();
    const screen = fakeScreen();
    const marks = createTileMarks(timers, screen.tileOf);
    marks.show('later', '+1', 'points').stored();
    screen.drawAnew('later');
    marks.redraw();
    expect(shown(screen.tile('later'))).toEqual({ mark: '+1', kind: 'points', state: 'stored' });
  });
});
