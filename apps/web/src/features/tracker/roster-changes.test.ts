// The Players panel's rules as data (step 2.118, part 1): a number worn twice is marked
// on both and never stops an add (S-44); only a player added at a table and not yet
// reviewed is renamed or taken off, never one this game names (S-45), with the reason;
// a change of number to one worn is said no to only where the season wants unique
// numbers (S-37); read-only when final or not scoring; every no has its words; plays
// refused because of a refused add are listed under it.
import {
  tablePlayerProblems,
  type BatchCommand,
  type TablePlayerCommand,
} from '@srleagues/contracts';
import { en } from '@srleagues/site';
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import type { DevicePlayer, DeviceRosters } from './opened-game-storage.ts';
import type { KeptTap } from './queue-storage.ts';
import {
  deviceProblem,
  numbersOfLine,
  playerProblemKey,
  playersPanel,
  refusedChanges,
  withChanges,
} from './roster-changes.ts';
import type { RefusedCommand } from './tracker-queue.ts';

const gameId = '00000000-0000-4000-8000-0000000000a1';
const id = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const player = (
  n: number,
  jersey: string | null,
  more: Partial<DevicePlayer> = {},
): DevicePlayer => ({
  personId: id(n),
  firstName: `Made${n}`,
  lastName: 'Up',
  jerseyNumber: jersey,
  left: false,
  addedAtGameId: null,
  toReview: false,
  ...more,
});
const atTable = { addedAtGameId: gameId, toReview: true };
const rosters = (uniqueJerseys = false): DeviceRosters => ({
  home: { teamId: id(90), name: 'Home', players: [player(1, '4'), player(2, '7', atTable)] },
  away: {
    teamId: id(91),
    name: 'Away',
    players: [player(3, '9', { addedAtGameId: gameId, toReview: false }), player(4, '4')],
  },
  uniqueJerseys,
  allowTies: false,
});
const command = (n: number, input: BatchCommand['input']): BatchCommand =>
  ({ commandId: id(50 + n), at: 1, input }) as BatchCommand;
const add = (n: number, jersey: string, name = '') =>
  command(n, { type: 'add-player', side: 'home', playerId: id(20 + n), jersey, name });

describe('the Players panel: the list and its marks', () => {
  it('reads a line of numbers, each once, in the order typed', () => {
    expect(numbersOfLine(' 3 5,10  12 14 5 ')).toEqual(['3', '5', '10', '12', '14']);
  });

  it('lists the rosters with the waiting changes, a clash marked on both and never refused', () => {
    const waiting = [add(1, '4', 'Made Twenty'), add(2, '12')];
    const shown = withChanges(rosters(true), waiting as TablePlayerCommand[], gameId);
    const panel = playersPanel({
      rosters: shown,
      waiting: waiting.map((c): KeptTap => ({ command: c, moment: null })),
      refused: [],
      game: null,
      scoring: true,
    });
    const home = panel.home.players;
    expect(home.map((p) => [p.player.jerseyNumber, p.waiting])).toEqual([
      ['4', false],
      ['7', false],
      ['4', true],
      ['12', true],
    ]);
    expect(home[0]?.clashWith).toEqual([id(21)]);
    expect(home[2]?.clashWith).toEqual([id(1)]);
    expect(home[2]?.player).toMatchObject({ firstName: 'Made', lastName: 'Twenty', ...atTable });
    // Even where the season wants unique numbers, an add with a worn number goes (S-44).
    const input = { type: 'add-player', side: 'home', playerId: id(30), jersey: '4', name: '' };
    expect(deviceProblem(rosters(true), input as never, null)).toBeNull();
    expect(panel.readOnly).toBeNull();
  });

  it('says who may be renamed or taken off, and why not', () => {
    const plays = basketball.apply(
      basketball.newGame(),
      {
        type: 'lineup',
        side: 'home',
        playerIds: [id(1), id(2), id(5), id(6), id(7)],
      } as never,
      { id: id(80), now: 1 },
    );
    const panel = playersPanel({
      rosters: rosters(),
      waiting: [],
      refused: [],
      game: plays,
      scoring: true,
    });
    const [league, table] = panel.home.players;
    expect(league?.rename).toMatchObject({ ok: false, problem: 'on-team-roster' });
    expect(table?.rename).toEqual({ ok: true });
    expect(table?.takeOff).toMatchObject({ ok: false, problem: 'has-plays' });
    expect(panel.away.players[0]?.rename).toMatchObject({ ok: false, problem: 'reviewed' });
    const unnamed = playersPanel({
      rosters: rosters(),
      waiting: [],
      refused: [],
      game: null,
      scoring: true,
    });
    expect(unnamed.home.players[1]?.takeOff).toEqual({ ok: true });
  });

  it('says no to a number worn only where the season wants unique numbers, naming the wearer', () => {
    const renumber = { type: 'change-player', side: 'home', playerId: id(2), jersey: '4' } as const;
    expect(deviceProblem(rosters(false), renumber, null)).toBeNull();
    expect(deviceProblem(rosters(true), renumber, null)).toEqual({
      problem: 'jersey-taken',
      key: 'tracker.players.refused.jersey-taken',
      wornBy: { playerId: id(1), jersey: '4' },
    });
    const empty = {
      type: 'change-player',
      side: 'home',
      playerId: id(2),
      jersey: '',
      name: ' ',
    } as const;
    expect(deviceProblem(rosters(), empty, null)?.problem).toBe('needs-name-or-number');
  });

  it('is read-only when the game is final or the device does not score it', () => {
    const final = { ...basketball.newGame(), status: 'final' } as basketball.GameState;
    const of = (game: basketball.GameState | null, scoring: boolean) =>
      playersPanel({ rosters: rosters(), waiting: [], refused: [], game, scoring }).readOnly;
    expect(of(final, true)).toEqual({ reason: 'final', key: 'tracker.players.readOnly.final' });
    expect(of(null, false)).toEqual({ reason: 'device', key: 'tracker.players.readOnly.device' });
    expect(deviceProblem(rosters(), add(1, '3').input as never, final)?.problem).toBe('game-over');
  });

  it('words every no from the message files', () => {
    for (const problem of tablePlayerProblems) expect(en[playerProblemKey(problem)]).toBeTruthy();
    expect(en['tracker.players.readOnly.final']).toBeTruthy();
    expect(en['tracker.players.readOnly.device']).toBeTruthy();
  });

  it('lists the plays refused because of a refused add under it', () => {
    const refusedAdd: RefusedCommand = {
      command: add(1, '12'),
      refusal: { code: 'rule', message: 'x', problem: 'player-id-taken' },
    };
    const play = (n: number): RefusedCommand => ({
      command: command(n, { type: 'score', side: 'home', playerId: id(21), points: 2 } as never),
      refusal: {
        code: 'rule',
        message: 'x',
        problem: 'player-not-added',
        playerId: id(21),
        follows: id(51),
      },
    });
    const other: RefusedCommand = {
      command: command(9, { type: 'undo' } as never),
      refusal: { code: 'rule', message: 'x' },
    };
    expect(refusedChanges([refusedAdd, play(2), other, play(3)])).toEqual([
      {
        playerId: id(21),
        change: refusedAdd,
        key: 'tracker.players.refused.player-id-taken',
        plays: [play(2), play(3)],
      },
    ]);
  });
});
