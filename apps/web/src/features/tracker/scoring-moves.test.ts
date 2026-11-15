// What a tap or a drag on the scoring screen means (step 2.35; checklist C1, C2, D4, D5,
// E1 to E3). Every tap made here is given to the engine itself, so a move the engine
// would refuse fails the test.
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { noLineupPicks, type LineupPicks } from './opened-game-storage.ts';
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
  type PadMode,
} from './scoring-moves.ts';
import { played, testRosters, tippedOff } from './scoring-test-game.test-helper.ts';
import { findTile, scoringView } from './scoring-view.ts';
import type { TapInput } from './tracker-controller.ts';

const viewOf = (game: basketball.GameState, picks: LineupPicks = noLineupPicks) =>
  scoringView(game, testRosters, picks);
const tileOf = (game: basketball.GameState, id: string) => {
  const tile = findTile(viewOf(game), id);
  if (tile === undefined) throw new Error(`no tile for ${id}`);
  return tile;
};
/** The game after the engine took the tap. */
const after = (game: basketball.GameState, input: TapInput) => played([input], game);

describe('picking the starters (C1, C2)', () => {
  it('picks and unpicks, and the fifth pick sets the lineup at once', () => {
    let picks: LineupPicks = noLineupPicks;
    const game = basketball.newGame();
    const tap = (id: string) => {
      const tapped = tapTile(viewOf(game, picks), picks, padAtRest, id);
      if (tapped?.kind !== 'pick') throw new Error('not a pick');
      picks = tapped.picks;
      return tapped.lineup;
    };
    expect(tap('h3')).toBeNull();
    expect(tap('h5')).toBeNull();
    expect(picks.home).toEqual(['h3', 'h5']);
    // Tapped again: unpicked.
    expect(tap('h3')).toBeNull();
    expect(picks.home).toEqual(['h5']);
    for (const id of ['h7', 'h9', 'h11']) expect(tap(id)).toBeNull();
    // The other team's picks are its own.
    expect(tap('a3')).toBeNull();
    expect(picks.away).toEqual(['a3']);
    const lineup = tap('h13');
    expect(lineup).toEqual({
      type: 'lineup',
      side: 'home',
      playerIds: ['h5', 'h7', 'h9', 'h11', 'h13'],
    });
    // The five stay picked until the lineup is taken, so a refusal loses no tap; once
    // the team's lineup is set the view no longer shows them.
    expect(picks).toEqual({ home: ['h5', 'h7', 'h9', 'h11', 'h13'], away: ['a3'] });
    if (lineup === null) throw new Error('no lineup');
    expect(viewOf(after(game, lineup), picks).teams.home.picks).toEqual([]);
    expect(basketball.derive(after(game, lineup)).teams.home.onCourt).toEqual([
      'h5',
      'h7',
      'h9',
      'h11',
      'h13',
    ]);
  });

  it('starts a short-handed team with the players picked, one to four', () => {
    const game = basketball.newGame();
    expect(startShortHanded(viewOf(game), 'away')).toBeNull();
    const picks = { home: [], away: ['a3', 'a7', 'a5'] };
    const lineup = startShortHanded(viewOf(game, picks), 'away');
    expect(lineup).toEqual({ type: 'lineup', side: 'away', playerIds: ['a3', 'a7', 'a5'] });
    if (lineup === null) throw new Error('no lineup');
    const set = after(game, lineup);
    expect(basketball.derive(set).teams.away.onCourt).toEqual(['a3', 'a7', 'a5']);
    // Setting a lineup does not make the game live for viewers (C4).
    expect(set.status).toBe('scheduled');
    // Once set there is nothing to start.
    expect(startShortHanded(viewOf(set), 'away')).toBeNull();
  });

  it('does nothing for a player the screen does not show', () => {
    expect(tapTile(viewOf(basketball.newGame()), noLineupPicks, padAtRest, 'nobody')).toBeNull();
  });
});

describe('a player’s options (D4, D5)', () => {
  it('opens on a tap, closes on a second, and moves to the next player tapped', () => {
    const view = viewOf(tippedOff());
    const open = tapTile(view, noLineupPicks, padAtRest, 'h5');
    expect(open).toEqual({ kind: 'pad', pad: { kind: 'player', playerId: 'h5' } });
    const pad: PadMode = { kind: 'player', playerId: 'h5' };
    expect(tapTile(view, noLineupPicks, pad, 'h5')).toEqual({ kind: 'pad', pad: padAtRest });
    expect(tapTile(view, noLineupPicks, pad, 'a13')).toEqual({
      kind: 'pad',
      pad: { kind: 'player', playerId: 'a13' },
    });
    // From a team's turnovers, a tapped player's options take over.
    expect(tapTile(view, noLineupPicks, { kind: 'turnovers', side: 'home' }, 'h3')).toEqual({
      kind: 'pad',
      pad: { kind: 'player', playerId: 'h3' },
    });
  });

  it('makes the tap of each option, and the engine takes each', () => {
    let game = tippedOff();
    const tap = (id: string, action: Parameters<typeof padTap>[1]) => {
      game = after(game, padTap(tileOf(game, id), action));
      return basketball.derive(game);
    };
    expect(tap('h5', 'p1').teams.home.score).toBe(1);
    expect(tap('h5', 'p2').teams.home.score).toBe(3);
    expect(tap('a13', 'p3').players.a13).toMatchObject({ points: 3, side: 'away' });
    expect(tap('h5', 'foul').players.h5?.fouls).toBe(1);
    expect(tap('h5', 'unfoul').players.h5?.fouls).toBe(0);
    expect(tap('a3', 'turnover').teams.away.turnovers).toBe(1);
    expect(game.status).toBe('live');
  });

  it('takes an option only while the pad is that player’s: once, not twice', () => {
    const open: PadMode = { kind: 'player', playerId: 'h5' };
    expect(padIsFor(open, 'h5')).toBe(true);
    // A substitution is taken from the pad of either of its two players.
    expect(padIsFor(open, 'h20', 'h5')).toBe(true);
    expect(padIsFor(open, 'h3')).toBe(false);
    // The pad goes to rest with the tap: the same option tapped again is not a play.
    expect(padIsFor(padAtRest, 'h5')).toBe(false);
    expect(padIsFor({ kind: 'turnovers', side: 'home' }, 'h5')).toBe(false);
  });

  it('is closed for a player the game no longer shows', () => {
    const view = viewOf(tippedOff());
    expect(padFor(view, { kind: 'player', playerId: 'h5' })).toEqual({
      kind: 'player',
      playerId: 'h5',
    });
    expect(padFor(view, { kind: 'player', playerId: 'nobody' })).toEqual(padAtRest);
    expect(padFor(view, { kind: 'turnovers', side: 'away' })).toEqual({
      kind: 'turnovers',
      side: 'away',
    });
    // The game was rebuilt on a state with no lineup: the options go.
    expect(padFor(viewOf(basketball.newGame()), { kind: 'player', playerId: 'h5' })).toEqual(
      padAtRest,
    );
  });
});

describe('substitutions (E1 to E3)', () => {
  it('brings a bench player in for a floor player, by "In for"', () => {
    const game = tippedOff();
    const sub = subTap(tileOf(game, 'h20'), tileOf(game, 'h7'));
    expect(sub).toEqual({ type: 'sub', side: 'home', inId: 'h20', outId: 'h7' });
    expect(basketball.derive(after(game, sub)).teams.home.onCourt).toEqual([
      'h3',
      'h5',
      'h20',
      'h9',
      'h11',
    ]);
  });

  it('substitutes when a bench player is dropped on a floor player of their team', () => {
    const game = tippedOff();
    const dropped = dropOn(viewOf(game), 'a21', 'a11');
    expect(dropped).toEqual({
      kind: 'sub',
      input: { type: 'sub', side: 'away', inId: 'a21', outId: 'a11' },
      inId: 'a21',
      outId: 'a11',
    });
    if (dropped?.kind !== 'sub') throw new Error('not a substitution');
    expect(basketball.derive(after(game, dropped.input)).teams.away.onCourt).toContain('a21');
  });

  it('explains a wrong drag, and says nothing when a player is dropped on nobody', () => {
    const view = viewOf(tippedOff());
    expect(dropOn(view, 'h20', 'a3')).toEqual({ kind: 'say', key: 'tracker.say.subAcrossTeams' });
    // A floor player dragged, or a bench player dropped on the bench.
    expect(dropOn(view, 'h3', 'h20')).toEqual({ kind: 'say', key: 'tracker.say.subBenchToFloor' });
    expect(dropOn(view, 'h3', 'h5')).toEqual({ kind: 'say', key: 'tracker.say.subBenchToFloor' });
    expect(dropOn(view, 'h20', 'h21')).toEqual({ kind: 'say', key: 'tracker.say.subBenchToFloor' });
    expect(dropOn(view, 'h20', null)).toBeNull();
    expect(dropOn(view, 'h20', 'h20')).toBeNull();
    expect(dropOn(view, 'h20', 'nobody')).toBeNull();
  });
});

describe('the whole bench, opened in the pad (area 4 review, M1 and M2)', () => {
  it('opens a bench player’s options, or brings them in for the player it was opened for', () => {
    const view = viewOf(tippedOff());
    const open: PadMode = { kind: 'bench', side: 'home', forId: null };
    expect(pickFromBench(view, open, 'h20')).toEqual({
      kind: 'pad',
      pad: { kind: 'player', playerId: 'h20' },
    });
    const forSeven: PadMode = { kind: 'bench', side: 'home', forId: 'h7' };
    const picked = pickFromBench(view, forSeven, 'h20');
    expect(picked).toMatchObject({ kind: 'sub', coming: { id: 'h20' }, going: { id: 'h7' } });
    if (picked?.kind !== 'sub') throw new Error('not a substitution');
    const game = after(tippedOff(), subTap(picked.coming, picked.going));
    expect(basketball.derive(game).teams.home.onCourt).toContain('h20');
  });

  it('takes nothing from a floor player, the other team, or a pad that is not the bench', () => {
    const view = viewOf(tippedOff());
    const open: PadMode = { kind: 'bench', side: 'home', forId: 'h7' };
    expect(pickFromBench(view, open, 'h3')).toBeNull();
    expect(pickFromBench(view, open, 'a20')).toBeNull();
    expect(pickFromBench(view, open, 'nobody')).toBeNull();
    expect(pickFromBench(view, padAtRest, 'h20')).toBeNull();
    // The player it was opened for has gone off since: nobody comes in for them.
    expect(pickFromBench(view, { kind: 'bench', side: 'home', forId: 'h20' }, 'h21')).toBeNull();
  });

  it('closes when the player it was opened for is no longer on the court', () => {
    const view = viewOf(tippedOff());
    const open: PadMode = { kind: 'bench', side: 'away', forId: null };
    expect(padFor(view, open)).toEqual(open);
    expect(padFor(view, { kind: 'bench', side: 'away', forId: 'a3' })).toEqual({
      kind: 'bench',
      side: 'away',
      forId: 'a3',
    });
    expect(padFor(view, { kind: 'bench', side: 'away', forId: 'a20' })).toEqual(padAtRest);
    expect(padFor(viewOf(basketball.newGame()), open)).toEqual(padAtRest);
  });
});

describe('swap colors (D3)', () => {
  it('swaps, and swaps back', () => {
    const game = tippedOff();
    expect(swapColorsTap(game)).toEqual({ type: 'colors', swapped: true });
    const swapped = after(game, swapColorsTap(game));
    expect(swapped.colorsSwapped).toBe(true);
    expect(swapColorsTap(swapped)).toEqual({ type: 'colors', swapped: false });
  });
});
