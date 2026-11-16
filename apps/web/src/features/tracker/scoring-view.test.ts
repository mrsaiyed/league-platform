// What the scoring screen shows, from the engine's own state (step 2.35; checklist C1 to
// C3, D1 to D3, D10, G1, G2; finding L7).
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { noLineupPicks } from './opened-game-storage.ts';
import {
  awayFive,
  homeFive,
  madeUpPlayer,
  played,
  testRosters,
  tippedOff,
} from './scoring-test-game.test-helper.ts';
import {
  findTile,
  inJerseyOrder,
  scoringView,
  teamColor,
  timeoutTakenBack,
} from './scoring-view.ts';

const ids = (tiles: readonly { readonly id: string }[]) => tiles.map((t) => t.id);

describe('the scoring screen’s view of a game', () => {
  it('lists everyone for picking until a lineup is set, and keeps the picks still on the roster', () => {
    const view = scoringView(basketball.newGame(), testRosters, {
      home: ['h5', 'gone', 'h3'],
      away: [],
    });
    expect(view.status).toBe('scheduled');
    expect(view.pickingLineups).toBe(true);
    expect(view.teams.home.stage).toBe('picking');
    expect(view.teams.home.floor).toEqual([]);
    expect(ids(view.teams.home.bench)).toEqual(testRosters.home.players.map((p) => p.personId));
    // A pick of someone no longer on the roster is dropped; the others keep their order.
    expect(view.teams.home.picks).toEqual(['h5', 'h3']);
    expect(findTile(view, 'h5')?.picked).toBe(true);
    expect(findTile(view, 'h7')?.picked).toBe(false);
    expect(view.teams.home.playerCount).toBe(8);
  });

  it('shows the five on the court in the engine’s order and the rest on the bench by number', () => {
    const view = scoringView(tippedOff(), testRosters, noLineupPicks);
    expect(view.pickingLineups).toBe(false);
    expect(view.teams.home.stage).toBe('set');
    expect(ids(view.teams.home.floor)).toEqual(homeFive);
    expect(ids(view.teams.home.bench)).toEqual(['h13', 'h20', 'h21']);
    expect(view.teams.away.floor.every((p) => p.onCourt)).toBe(true);
    // Picks kept from before are done with once the lineup is set (from another device, say).
    const stale = scoringView(tippedOff(), testRosters, { home: ['h3'], away: ['a3'] });
    expect(stale.teams.home.picks).toEqual([]);
    expect(findTile(stale, 'h3')?.picked).toBe(false);
  });

  it('keeps a tile where it is when its player is substituted', () => {
    const game = played([{ type: 'sub', side: 'home', inId: 'h20', outId: 'h7' }], tippedOff());
    const view = scoringView(game, testRosters, noLineupPicks);
    expect(ids(view.teams.home.floor)).toEqual(['h3', 'h5', 'h20', 'h9', 'h11']);
    expect(ids(view.teams.home.bench)).toEqual(['h7', 'h13', 'h21']);
  });

  it('shows each player’s points and fouls, and each team’s score, as the engine has them', () => {
    const game = played(
      [
        { type: 'score', side: 'home', playerId: 'h5', points: 3 },
        { type: 'score', side: 'home', playerId: 'h5', points: 2 },
        { type: 'foul', side: 'home', playerId: 'h5' },
        { type: 'score', side: 'away', playerId: 'a13', points: 1 },
        { type: 'foul', side: 'away', playerId: 'a3' },
        { type: 'foul', side: 'away', playerId: 'a3' },
        { type: 'unfoul', side: 'away', playerId: 'a3' },
      ],
      tippedOff(),
    );
    const view = scoringView(game, testRosters, noLineupPicks);
    const derived = basketball.derive(game);
    expect(view.status).toBe('live');
    expect(view.teams.home.score).toBe(derived.teams.home.score);
    expect(view.teams.home.score).toBe(5);
    expect(view.teams.away.score).toBe(1);
    expect(findTile(view, 'h5')).toMatchObject({ points: 5, fouls: 1, onCourt: true });
    // A bench player can be scored without coming on (checklist E4).
    expect(findTile(view, 'a13')).toMatchObject({ points: 1, onCourt: false });
    expect(findTile(view, 'a3')?.fouls).toBe(1);
  });

  it('marks a player at the league’s foul limit, whatever the limit is (D10)', () => {
    const fouls = (count: number): basketball.Command[] =>
      Array.from({ length: count }, () => ({ type: 'foul', side: 'home', playerId: 'h9' }));
    const four = { ...basketball.QUARTERS, playerFoulLimit: 4 };
    const atThree = scoringView(played(fouls(3), tippedOff(four)), testRosters, noLineupPicks);
    expect(findTile(atThree, 'h9')?.fouledOut).toBe(false);
    const atFour = scoringView(played(fouls(4), tippedOff(four)), testRosters, noLineupPicks);
    expect(findTile(atFour, 'h9')).toMatchObject({ fouls: 4, fouledOut: true, onCourt: true });
    // A league with no limit never marks anyone.
    const none = scoringView(played(fouls(9), tippedOff()), testRosters, noLineupPicks);
    expect(findTile(none, 'h9')?.fouledOut).toBe(false);
  });

  it('hides a player who has left, unless they have a line in this game (finding L7)', () => {
    const rosters = {
      ...testRosters,
      home: {
        ...testRosters.home,
        players: [
          ...testRosters.home.players,
          madeUpPlayer('h40', '40', 'Gone', 'Hawkins', true),
          madeUpPlayer('h41', '41', 'Left', 'Hawkins', true),
        ],
      },
    };
    const before = scoringView(tippedOff(), rosters, noLineupPicks);
    expect(findTile(before, 'h40')).toBeUndefined();
    expect(before.teams.home.playerCount).toBe(8);
    const scored = played(
      [{ type: 'score', side: 'home', playerId: 'h41', points: 2 }],
      tippedOff(),
    );
    const after = scoringView(scored, rosters, noLineupPicks);
    expect(findTile(after, 'h41')).toMatchObject({ points: 2, onCourt: false });
    expect(findTile(after, 'h40')).toBeUndefined();
  });

  it('lists a team’s turnovers, most first, with the team’s own (G1, G2)', () => {
    const turnover = (playerId: string): basketball.Command => ({
      type: 'turnover',
      side: 'away',
      playerId,
    });
    const game = played(
      [
        turnover('a9'),
        turnover('a3'),
        turnover('a9'),
        turnover('a20'),
        { type: 'team-turnover', side: 'away' },
        { type: 'unturnover', side: 'away', playerId: 'a20' },
      ],
      tippedOff(),
    );
    const view = scoringView(game, testRosters, noLineupPicks);
    expect(view.teams.away.turnovers).toBe(basketball.derive(game).teams.away.turnovers);
    expect(view.teams.away.turnovers).toBe(4);
    expect(view.teams.away.teamTurnovers).toBe(1);
    expect(view.teams.away.turnoverList.map((p) => [p.id, p.turnovers])).toEqual([
      ['a9', 2],
      ['a3', 1],
    ]);
    expect(view.teams.home.turnoverList).toEqual([]);
  });

  it('draws home light and away dark, and the other way round once swapped (D3)', () => {
    expect(teamColor('home', false)).toBe('light');
    expect(teamColor('away', false)).toBe('dark');
    const swapped = played([{ type: 'colors', swapped: true }], tippedOff());
    const view = scoringView(swapped, testRosters, noLineupPicks);
    expect(view.teams.home.color).toBe('dark');
    expect(view.teams.away.color).toBe('light');
  });

  it('credits a player on the court their open stint, and says which period it is', () => {
    const running = played([{ type: 'start' }], tippedOff());
    const elapsed = basketball.clockAt(running, running.lastAt + 65_000).elapsedMs;
    const view = scoringView(running, testRosters, noLineupPicks, elapsed);
    expect(findTile(view, 'h3')?.ms).toBe(65_000);
    expect(findTile(view, 'h13')?.ms).toBe(0);
    expect(view.period).toBe(1);
    expect(view.periods).toBe(4);
  });

  it('draws every player the engine has, on this device’s rosters or not (review M5)', () => {
    // Another table added a player a minute ago: the engine has them on the court and
    // with a basket; this device's rosters do not know them yet.
    const game = played(
      [
        { type: 'sub', side: 'home', inId: 'walk-on', outId: 'h7' },
        { type: 'score', side: 'home', playerId: 'walk-on', points: 3 },
        { type: 'foul', side: 'away', playerId: 'late-bear' },
      ],
      tippedOff(),
    );
    const view = scoringView(game, testRosters, noLineupPicks);
    const derived = basketball.derive(game);
    // Five on the court in the engine, five tiles, in the engine's order.
    expect(ids(view.teams.home.floor)).toEqual(derived.teams.home.onCourt);
    expect(view.teams.home.floor).toHaveLength(5);
    expect(findTile(view, 'walk-on')).toMatchObject({
      side: 'home',
      onCourt: true,
      points: 3,
      number: null,
      unlisted: true,
    });
    // The tiles' points add up to the team's score.
    const tiles = [...view.teams.home.floor, ...view.teams.home.bench];
    expect(tiles.reduce((sum, p) => sum + p.points, 0)).toBe(view.teams.home.score);
    // A bench player with a line the rosters lack is on the bench, last (no number).
    expect(view.teams.away.bench.at(-1)).toMatchObject({ id: 'late-bear', fouls: 1 });
    expect(findTile(view, 'h3')?.unlisted).toBe(false);
    // They can be substituted off: the tile is there to tap, and stays the same object.
    const again = scoringView(game, testRosters, noLineupPicks);
    expect(findTile(again, 'walk-on')?.player).toBe(findTile(view, 'walk-on')?.player);
  });

  it('says a team has no players, and does not wait for its lineup', () => {
    const rosters = { ...testRosters, away: { ...testRosters.away, players: [] } };
    const game = played([{ type: 'lineup', side: 'home', playerIds: homeFive }]);
    const view = scoringView(game, rosters, noLineupPicks);
    expect(view.teams.away.stage).toBe('no-players');
    expect(view.pickingLineups).toBe(false);
    expect(awayFive.every((id) => findTile(view, id) === undefined)).toBe(true);
  });
});

/** `count` fouls on one player of `side`. */
const fouls = (side: 'home' | 'away', playerId: string, count: number): basketball.Command[] =>
  Array.from({ length: count }, () => ({ type: 'foul', side, playerId }) as const);

describe('team fouls and the bonus (step 2.36; checklist F1 to F5)', () => {
  // The rec-league format: the bonus on the 7th team foul of a period, the double on the 10th.
  const halves = () => tippedOff(basketball.HALVES);
  const team = (game: basketball.GameState, side: 'home' | 'away') =>
    scoringView(game, testRosters, noLineupPicks).teams[side];

  it('counts a team’s fouls in the period being played', () => {
    const game = played([...fouls('home', 'h3', 2), ...fouls('home', 'h5', 1)], halves());
    expect(team(game, 'home')).toMatchObject({ teamFouls: 3, foulLevel: 0, bonus: 0 });
    expect(team(game, 'away')).toMatchObject({ teamFouls: 0, foulLevel: 0, bonus: 0 });
  });

  it('grows at the bonus and the double bonus, and gives the OTHER team the badge', () => {
    const six = played(fouls('home', 'h3', 6), halves());
    expect(team(six, 'home').foulLevel).toBe(0);
    expect(team(six, 'away').bonus).toBe(0);
    const seven = played(fouls('home', 'h5', 1), six);
    expect(team(seven, 'home')).toMatchObject({ teamFouls: 7, foulLevel: 1, bonus: 0 });
    expect(team(seven, 'away')).toMatchObject({ teamFouls: 0, foulLevel: 0, bonus: 1 });
    const ten = played(fouls('home', 'h7', 3), seven);
    expect(team(ten, 'home')).toMatchObject({ teamFouls: 10, foulLevel: 2 });
    expect(team(ten, 'away').bonus).toBe(2);
  });

  it('drops again when a foul is taken back', () => {
    const seven = played(fouls('home', 'h3', 7), halves());
    const back = played([{ type: 'unfoul', side: 'home', playerId: 'h3' }], seven);
    expect(team(back, 'home')).toMatchObject({ teamFouls: 6, foulLevel: 0 });
    expect(team(back, 'away').bonus).toBe(0);
  });

  it('starts again each period, and overtime carries on the last period’s count (F5)', () => {
    const first = played(fouls('home', 'h3', 7), halves());
    const second = played([{ type: 'period', period: 2 }], first);
    expect(team(second, 'home')).toMatchObject({ teamFouls: 0, foulLevel: 0 });
    expect(team(second, 'away').bonus).toBe(0);
    const late = played(fouls('away', 'a3', 8), second);
    const overtime = played([{ type: 'period', period: 3 }, ...fouls('away', 'a5', 2)], late);
    expect(team(overtime, 'away')).toMatchObject({ teamFouls: 10, foulLevel: 2 });
    expect(team(overtime, 'home').bonus).toBe(2);
  });

  it('a format with no double bonus never shows one', () => {
    const game = played(fouls('home', 'h3', 12), tippedOff(basketball.QUARTERS));
    expect(team(game, 'home')).toMatchObject({ teamFouls: 12, foulLevel: 1 });
    expect(team(game, 'away').bonus).toBe(1);
  });
});

describe('timeouts (step 2.36; checklist G3 to G7)', () => {
  const timeouts = (game: basketball.GameState, side: 'home' | 'away') =>
    scoringView(game, testRosters, noLineupPicks).teams[side].timeouts;
  const call = (side: 'home' | 'away', seconds: 60 | 30): basketball.Command => ({
    type: 'timeout',
    side,
    seconds,
  });

  it('says how many are left, by length', () => {
    // Three full and two 30-second a game.
    const game = tippedOff(basketball.QUARTERS);
    expect(timeouts(game, 'home')).toMatchObject({ full: 3, short: 2, left: 5, offersShort: true });
    const after = played([call('home', 60), call('home', 30), call('away', 60)], game);
    expect(timeouts(after, 'home')).toMatchObject({ full: 2, short: 1, left: 3 });
    expect(timeouts(after, 'away')).toMatchObject({ full: 2, short: 2, left: 4 });
  });

  it('lists those taken with their period and clock time, oldest first', () => {
    const started = played([{ type: 'start' }], tippedOff(basketball.QUARTERS));
    const first = basketball.apply(started, call('home', 60), {
      id: 'first',
      now: started.lastAt + 30_000,
    });
    const second = played([{ type: 'period', period: 2 }, call('home', 30)], first);
    expect(timeouts(second, 'home').taken).toEqual([
      { id: 'first', period: 1, clockMs: 450_000, seconds: 60 },
      expect.objectContaining({ period: 2, clockMs: 480_000, seconds: 30 }),
    ]);
    expect(timeouts(second, 'away').taken).toEqual([]);
  });

  it('taking the latest back gives it back', () => {
    const game = played(
      [call('home', 60), call('home', 30), { type: 'untimeout', side: 'home' }],
      tippedOff(basketball.QUARTERS),
    );
    expect(timeouts(game, 'home')).toMatchObject({ full: 2, short: 2, left: 4 });
    expect(timeouts(game, 'home').taken.map((t) => t.seconds)).toEqual([60]);
  });

  it('knows which timeout a take-back took back, so the screen can say it (M2)', () => {
    const at = (game: basketball.GameState, id: string, command: basketball.Command) =>
      basketball.apply(game, command, { id, now: game.lastAt + 30_000 });
    // Two by the home team with one by the visitors between them, in the second quarter;
    // then the home team's latest is taken back.
    const second = played([{ type: 'period', period: 2 }], tippedOff(basketball.QUARTERS));
    const first = at(second, 'first', call('home', 60));
    const other = at(first, 'other', call('away', 60));
    const latest = at(other, 'latest', call('home', 30));
    const back = at(latest, 'back', { type: 'untimeout', side: 'home' });
    expect(timeoutTakenBack(back, 'back')).toEqual({
      id: 'latest',
      period: 2,
      clockMs: 480_000,
      seconds: 30,
    });
    // One more take-back finds the one before it, never the other team's.
    const again = at(back, 'again', { type: 'untimeout', side: 'home' });
    expect(timeoutTakenBack(again, 'again')?.id).toBe('first');
    expect(timeoutTakenBack(again, 'back')?.id).toBe('latest');
    // A play that is not a take-back, and a take-back with nothing to take.
    expect(timeoutTakenBack(again, 'first')).toBeUndefined();
    expect(timeoutTakenBack(again, 'nothing')).toBeUndefined();
  });

  it('never reads below none left when a team took more than it had', () => {
    // Two full a half and no 30-second ones.
    const game = played(
      [call('home', 60), call('home', 60), call('home', 60)],
      tippedOff(basketball.HALVES),
    );
    expect(timeouts(game, 'home')).toMatchObject({ full: 0, short: 0, left: 0 });
    expect(timeouts(game, 'home').taken).toHaveLength(3);
    // A new half gives the team its timeouts again.
    const second = played([{ type: 'period', period: 2 }], game);
    expect(timeouts(second, 'home')).toMatchObject({ full: 2, left: 2 });
  });

  it('offers 30-second timeouts only where the format has them, or one was taken', () => {
    const game = tippedOff(basketball.HALVES);
    expect(timeouts(game, 'home').offersShort).toBe(false);
    expect(timeouts(played([call('home', 30)], game), 'home').offersShort).toBe(true);
    const view = scoringView(game, testRosters, noLineupPicks);
    expect(view.timeoutRules).toEqual({
      fullTimeouts: 2,
      shortTimeouts: 0,
      timeoutsPer: 'half',
      overtimeTimeouts: 1,
      timeoutsCarry: false,
    });
  });
});

describe('jersey order', () => {
  it('goes by number, 00 before 0, players with no number last, then by name', () => {
    const p = (id: string, jersey: string | null, last = 'Z') =>
      madeUpPlayer(id, jersey, 'A', last);
    const order = inJerseyOrder([
      p('none-b', null, 'B'),
      p('ten', '10'),
      p('zero', '0'),
      p('none-a', '', 'A'),
      p('double-zero', '00'),
      p('three', '3'),
    ]).map((player) => player.personId);
    expect(order).toEqual(['double-zero', 'zero', 'three', 'ten', 'none-a', 'none-b']);
  });
});
