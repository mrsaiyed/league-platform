// Players at the scorer's table (step 2.117; P7 §2 and §5.2; S-6, S-34, S-37; record
// 058, T-261), through the tracker's own batch: a visiting team with no roster is
// entered by number only and scored, a retry adds no one twice, a number already worn
// is refused naming who wears it, and only whoever may score the game, for its two
// teams, changes anything. The same against the real database is in packages/database
// (stores/table-players-commands.test.ts, the two-league harness and the role matrix).
import {
  CommandBatchV1,
  seasonRulesPreset,
  type BatchCommand,
  type CommandResult,
  type TablePlayerInput,
  type TrackerCommand,
} from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { applyTrackerCommands } from './commands/apply-tracker-commands.ts';
import {
  awayTeamId,
  editorGrant,
  editorId,
  game,
  gameUuid,
  homeTeamId,
  scorekeeperGrant,
  scorekeeperId,
  scoringRule,
  seasonId,
} from './memory-games.test-helper.ts';
import { sessionUuid, startOfTest } from './memory-scoring.test-helper.ts';
import { memoryTracker, type MemoryTracker } from './memory-tracker.test-helper.ts';
import type { GamePlayer, GameRosterPlayer } from './ports.ts';
import { leaseMs } from './scoring-session.ts';
import { namedInState, splitTableName } from './table-players.ts';

const gameId = gameUuid(1);
const sessionId = sessionUuid(1);
const homeIds = [1, 2, 3, 4, 5].map((n) => `01900000-0000-7000-8000-00000001000${n}`);
/** The ids the device makes for the visitors it enters by number. */
const walkUp = (n: number) => `01900000-0000-7000-8000-0000000f${String(n).padStart(4, '0')}`;
const commandUuid = (n: number) => `01900000-0000-7000-8000-0000c0${String(n).padStart(6, '0')}`;

/** The home team: five named players numbered 10 to 14. The visitors have no roster. */
const homeRoster: GameRosterPlayer[] = homeIds.map((personId, i) => ({
  teamId: homeTeamId,
  personId,
  firstName: `Home${i + 1}`,
  lastName: 'Player',
  jerseyNumber: String(i + 10),
  left: false,
}));
const players = (list: readonly GameRosterPlayer[]): GamePlayer[] =>
  list.map((p) => ({
    personId: p.personId,
    teamId: p.teamId,
    jerseyNumber: p.jerseyNumber,
    onGameDay: true,
  }));

function setUp(state: Partial<MemoryTracker> = {}) {
  const roster = state.roster ?? homeRoster;
  return memoryTracker({
    seasons: [{ id: seasonId, programId: 'p1', rules: seasonRulesPreset('high-school') }],
    games: [game(1, { captureMode: 'live' })],
    grants: [scorekeeperGrant, editorGrant],
    sessions: [
      {
        id: sessionId,
        gameId,
        accountId: scorekeeperId,
        deviceId: 'tablet',
        since: startOfTest,
        heldUntil: startOfTest + leaseMs,
      },
    ],
    ...state,
    roster,
    players: players(roster),
  });
}

type Input = TrackerCommand['input'] | TablePlayerInput;

function commands(inputs: readonly Input[], first = 1): BatchCommand[] {
  return inputs.map(
    (input, i) =>
      ({ commandId: commandUuid(first + i), at: startOfTest + i * 1000, input }) as BatchCommand,
  );
}

const batchOf = (list: BatchCommand[]) => ({
  gameId,
  protocolVersion: 2,
  sessionId,
  commands: list,
});

/** The eight numbers a school arrives with, typed at the table: "3 5 10 12 14 21 23 30". */
const eight = ['3', '5', '10', '12', '14', '21', '23', '30'];
const addEight: TablePlayerInput[] = eight.map((jersey, i) => ({
  type: 'add-player',
  side: 'away',
  playerId: walkUp(i + 1),
  jersey,
  name: '',
}));
/** #12 is the fourth of them. */
const twelve = walkUp(4);

const run = async (t: ReturnType<typeof setUp>, list: BatchCommand[], as = scorekeeperId) =>
  applyTrackerCommands(t.as(as), batchOf(list), t.deps);

const resultsOf = (result: Awaited<ReturnType<typeof run>>): readonly CommandResult[] => {
  if (!result.ok) throw new Error(result.error.code);
  return result.value.results;
};

const statusesOf = (result: Awaited<ReturnType<typeof run>>) =>
  resultsOf(result).map((r) => r.status);

const reasonOf = (result: Awaited<ReturnType<typeof run>>, n = 0) => {
  const one = resultsOf(result)[n];
  return one?.status === 'refused' ? one.reason : undefined;
};

describe('a visiting team with no roster, entered by number at the table (the done test)', () => {
  it('adds eight number-only players and scores one of them', async () => {
    const t = setUp();
    const list = commands([
      ...addEight,
      { type: 'lineup', side: 'home', playerIds: homeIds },
      { type: 'lineup', side: 'away', playerIds: [1, 2, 3, 4, 5].map(walkUp) },
      { type: 'start' },
      { type: 'score', side: 'away', playerId: twelve, points: 2 },
    ]);
    const result = await run(t, list);
    expect(statusesOf(result)).toEqual(list.map(() => 'accepted'));
    const s = t.db.state;
    // Each is a person with no name at all (S-34), on the visiting team with their number.
    const visitors = s.roster.filter((r) => r.teamId === awayTeamId);
    expect(visitors.map((r) => [r.jerseyNumber, r.firstName, r.lastName])).toEqual(
      eight.map((jersey) => [jersey, '', '']),
    );
    // Marked as added at this game and to review (S-6, migration 0010).
    expect(s.tableMarks).toEqual(
      eight.map((_, i) => ({
        teamId: awayTeamId,
        personId: walkUp(i + 1),
        addedAtGameId: gameId,
        needsReview: true,
      })),
    );
    // #12's basket is on the score and on their line, with their number.
    expect(s.games[0]).toMatchObject({ status: 'live', awayScore: 2, homeScore: 0 });
    expect(s.liveLines.find((l) => l.personId === twelve)).toMatchObject({
      teamId: awayTeamId,
      jerseyNumber: '12',
      stats: { points: 2, fg2: 1 },
    });
  });

  it('adds each player once when the same request is sent twice', async () => {
    const t = setUp();
    const list = commands([...addEight, { type: 'lineup', side: 'home', playerIds: homeIds }]);
    expect(statusesOf(await run(t, list))).toEqual(list.map(() => 'accepted'));
    const again = await run(t, list);
    expect(statusesOf(again)).toEqual(list.map(() => 'duplicate'));
    expect(t.db.state.roster.filter((r) => r.teamId === awayTeamId)).toHaveLength(8);
    expect(t.db.state.events).toHaveLength(9);
  });

  it('takes the plays after a player whose answer was lost: the player is there once, before them', async () => {
    const t = setUp();
    const [add] = commands([addEight[3] as TablePlayerInput]);
    if (add === undefined) throw new Error('no command');
    await run(t, [add]);
    // The device never heard back, so it sends the add again with what it tapped after it.
    const later = commands(
      [
        { type: 'lineup', side: 'away', playerIds: [twelve] },
        { type: 'score', side: 'away', playerId: twelve, points: 3 },
      ],
      20,
    );
    expect(statusesOf(await run(t, [add, ...later]))).toEqual([
      'duplicate',
      'accepted',
      'accepted',
    ]);
    expect(t.db.state.roster.filter((r) => r.personId === twelve)).toHaveLength(1);
    expect(t.db.state.events.map((e) => e.type)).toEqual(['add-player', 'lineup', 'score']);
  });

  it('files a player the device named in capitals under its id in lower case', async () => {
    const t = setUp();
    const upper = twelve.toUpperCase();
    const list = commands([
      { type: 'add-player', side: 'away', playerId: upper, jersey: '12', name: '' },
      { type: 'lineup', side: 'away', playerIds: [upper] },
    ]);
    expect(statusesOf(await run(t, list))).toEqual(['accepted', 'accepted']);
    expect(t.db.state.roster.find((r) => r.teamId === awayTeamId)?.personId).toBe(twelve);
  });

  it('keeps the event with ids and the number only, never the typed name, and logs ids only', async () => {
    const t = setUp();
    const list = commands([
      { type: 'add-player', side: 'away', playerId: twelve, jersey: '12', name: 'Yusuf Ali' },
      { type: 'change-player', side: 'away', playerId: twelve, name: 'Yusuf Ahmed Ali' },
    ]);
    expect(statusesOf(await run(t, list))).toEqual(['accepted', 'accepted']);
    const s = t.db.state;
    expect(s.events.map((e) => e.payload)).toEqual([
      { side: 'away', playerId: twelve, jersey: '12', named: true },
      { side: 'away', playerId: twelve, renamed: true },
    ]);
    expect(JSON.stringify(s.events)).not.toContain('Yusuf');
    expect(s.activity.map((a) => [a.action, a.targetId, a.details])).toEqual([
      [
        'games.apply_tracker_commands',
        awayTeamId,
        { gameId, personId: twelve, change: 'added', review: true },
      ],
      [
        'games.apply_tracker_commands',
        awayTeamId,
        { gameId, personId: twelve, change: 'changed', number: false, name: true },
      ],
    ]);
    expect(JSON.stringify(s.activity)).not.toContain('Yusuf');
    // The first word is the first name, the rest the last name.
    expect(s.roster.find((r) => r.personId === twelve)).toMatchObject({
      firstName: 'Yusuf',
      lastName: 'Ahmed Ali',
    });
  });
});

describe('who may change the players (whoever may score this game, its two teams only)', () => {
  it('refuses someone who may not score the game, a visitor, and a scorekeeper of another game', async () => {
    const t = setUp();
    for (const who of [editorId, null]) {
      expect(
        await applyTrackerCommands(t.as(who), batchOf(commands(addEight)), t.deps),
      ).toMatchObject({ ok: false, error: { code: 'not-allowed' } });
    }
    // Where only those assigned score, a scorekeeper not assigned to this game is refused.
    const assigned = setUp({ settings: scoringRule('assignedOnly') });
    expect(await run(assigned, commands(addEight))).toMatchObject({
      ok: false,
      error: { code: 'not-allowed' },
    });
    expect([t.db.state.roster, assigned.db.state.roster]).toEqual([homeRoster, homeRoster]);
  });

  it('refuses a change of players from a device that no longer holds the game', async () => {
    const t = setUp({ sessions: [] });
    const result = await run(t, commands(addEight.slice(0, 1)));
    expect(reasonOf(result)).toMatchObject({ code: 'session-not-held' });
    expect(t.db.state.roster).toEqual(homeRoster);
  });

  it('refuses a change of players for a game that is over', async () => {
    const t = setUp({ games: [game(1, { captureMode: 'live', status: 'final' })] });
    const result = await run(t, commands(addEight.slice(0, 1)));
    expect(reasonOf(result)).toMatchObject({ code: 'game-not-live' });
    expect(t.db.state.roster).toEqual(homeRoster);
  });

  it('changes only the players of the side named: a home player is not on the visiting team', async () => {
    const t = setUp();
    const result = await run(
      t,
      commands([{ type: 'change-player', side: 'away', playerId: homeIds[0] ?? '', jersey: '7' }]),
    );
    expect(reasonOf(result)).toMatchObject({ code: 'rule', problem: 'not-on-team' });
    expect(t.db.state.roster).toEqual(homeRoster);
  });

  it('refuses a new player whose id is already someone’s', async () => {
    const t = setUp();
    const result = await run(
      t,
      commands([
        { type: 'add-player', side: 'away', playerId: homeIds[0] ?? '', jersey: '9', name: '' },
      ]),
    );
    expect(reasonOf(result)).toMatchObject({ code: 'rule', problem: 'player-id-taken' });
  });

  it('is not taken from a tracker of version 1, which only taps', async () => {
    const t = setUp();
    const result = await applyTrackerCommands(
      t.as(scorekeeperId),
      { ...batchOf(commands(addEight.slice(0, 1))), protocolVersion: 1 },
      t.deps,
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(
      CommandBatchV1.safeParse({ ...batchOf(commands(addEight)), protocolVersion: 1 }).success,
    ).toBe(false);
    expect(t.db.state.roster).toEqual(homeRoster);
  });
});

describe('numbers (S-37)', () => {
  it('refuses a second "5" where the season wants unique numbers, naming who wears it, and goes on', async () => {
    const named: GameRosterPlayer = {
      teamId: awayTeamId,
      personId: walkUp(90),
      firstName: 'Jordan',
      lastName: 'Ellis',
      jerseyNumber: '5',
      left: false,
    };
    const t = setUp({ uniqueJerseys: true, roster: [...homeRoster, named] });
    const list = commands([
      { type: 'add-player', side: 'away', playerId: walkUp(1), jersey: '5', name: '' },
      { type: 'add-player', side: 'away', playerId: walkUp(2), jersey: '6', name: '' },
    ]);
    const result = await run(t, list);
    expect(statusesOf(result)).toEqual(['refused', 'accepted']);
    expect(reasonOf(result)).toEqual({
      code: 'rule',
      message: 'Number 5 is already worn by Jordan Ellis on this team.',
      problem: 'jersey-taken',
      wornBy: walkUp(90),
    });
    // A change to a number worn is refused the same way.
    const change = await run(
      t,
      commands([{ type: 'change-player', side: 'away', playerId: walkUp(2), jersey: '5' }], 10),
    );
    expect(reasonOf(change)).toMatchObject({ problem: 'jersey-taken', wornBy: walkUp(90) });
    expect(t.db.state.roster.filter((r) => r.jerseyNumber === '5')).toHaveLength(1);
  });

  it('names a wearer with no name as another player on the team', async () => {
    const t = setUp({ uniqueJerseys: true });
    const list = commands([
      { type: 'add-player', side: 'away', playerId: walkUp(1), jersey: '5', name: '' },
      { type: 'add-player', side: 'away', playerId: walkUp(2), jersey: '5', name: '' },
    ]);
    const result = await run(t, list);
    expect(reasonOf(result, 1)).toEqual({
      code: 'rule',
      message: 'Number 5 is already worn by another player on this team.',
      problem: 'jersey-taken',
      wornBy: walkUp(1),
    });
  });

  it('takes two of the same number where the season does not ask for unique ones', async () => {
    const t = setUp();
    const list = commands([
      { type: 'add-player', side: 'away', playerId: walkUp(1), jersey: '5', name: '' },
      { type: 'add-player', side: 'away', playerId: walkUp(2), jersey: '5', name: '' },
    ]);
    expect(statusesOf(await run(t, list))).toEqual(['accepted', 'accepted']);
  });

  it('changes a rostered player’s number, and the line of this game takes it', async () => {
    const t = setUp();
    const first = homeIds[0] ?? '';
    await run(
      t,
      commands([
        { type: 'lineup', side: 'home', playerIds: [first] },
        { type: 'score', side: 'home', playerId: first, points: 2 },
      ]),
    );
    expect(t.db.state.liveLines[0]?.jerseyNumber).toBe('10');
    const result = await run(
      t,
      commands([{ type: 'change-player', side: 'home', playerId: first, jersey: '44' }], 10),
    );
    expect(statusesOf(result)).toEqual(['accepted']);
    expect(t.db.state.roster.find((r) => r.personId === first)?.jerseyNumber).toBe('44');
    expect(t.db.state.liveLines.find((l) => l.personId === first)).toMatchObject({
      jerseyNumber: '44',
      stats: { points: 2 },
    });
    expect(t.db.state.events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(t.db.state.states[0]?.seq).toBe(3);
  });

  it('takes a number away only from a player who has a name', async () => {
    const t = setUp();
    await run(t, commands(addEight.slice(0, 1)));
    const nameless = await run(
      t,
      commands([{ type: 'change-player', side: 'away', playerId: walkUp(1), jersey: '' }], 10),
    );
    expect(reasonOf(nameless)).toMatchObject({ problem: 'needs-name-or-number' });
    const first = homeIds[0] ?? '';
    const named = await run(
      t,
      commands([{ type: 'change-player', side: 'home', playerId: first, jersey: '' }], 20),
    );
    expect(statusesOf(named)).toEqual(['accepted']);
    expect(t.db.state.roster.find((r) => r.personId === first)?.jerseyNumber).toBeNull();
  });
});

describe('names (S-34, S-37)', () => {
  it('renames a player added at the table, but not one from the team’s roster', async () => {
    const t = setUp();
    await run(t, commands(addEight.slice(0, 1)));
    const renamed = await run(
      t,
      commands(
        [{ type: 'change-player', side: 'away', playerId: walkUp(1), name: '  Sam   Lee ' }],
        10,
      ),
    );
    expect(statusesOf(renamed)).toEqual(['accepted']);
    expect(t.db.state.roster.find((r) => r.personId === walkUp(1))).toMatchObject({
      firstName: 'Sam',
      lastName: 'Lee',
      jerseyNumber: '3',
    });
    const rostered = await run(
      t,
      commands(
        [{ type: 'change-player', side: 'home', playerId: homeIds[0] ?? '', name: 'Someone Else' }],
        20,
      ),
    );
    expect(reasonOf(rostered)).toMatchObject({ code: 'rule', problem: 'name-from-roster' });
    expect(t.db.state.roster.find((r) => r.personId === homeIds[0])?.firstName).toBe('Home1');
  });

  it('adds a player by name only, and refuses one with neither', async () => {
    const t = setUp();
    const result = await run(
      t,
      commands([
        { type: 'add-player', side: 'away', playerId: walkUp(1), jersey: '', name: 'Yusuf' },
      ]),
    );
    expect(statusesOf(result)).toEqual(['accepted']);
    expect(t.db.state.roster.find((r) => r.personId === walkUp(1))).toMatchObject({
      firstName: 'Yusuf',
      lastName: '',
      jerseyNumber: null,
    });
  });
});

describe('taking a player off the game’s list', () => {
  it('takes off a player added here by mistake, and a play naming them after is refused', async () => {
    const t = setUp();
    await run(t, commands(addEight.slice(0, 2)));
    const result = await run(
      t,
      commands(
        [
          { type: 'remove-player', side: 'away', playerId: walkUp(2) },
          { type: 'lineup', side: 'away', playerIds: [walkUp(2)] },
        ],
        10,
      ),
    );
    expect(statusesOf(result)).toEqual(['accepted', 'refused']);
    expect(t.db.state.roster.map((r) => r.personId)).not.toContain(walkUp(2));
    expect(t.db.state.tableMarks.map((m) => m.personId)).toEqual([walkUp(1)]);
    expect(t.db.state.events.at(-1)).toMatchObject({
      type: 'remove-player',
      payload: { side: 'away', playerId: walkUp(2) },
    });
  });

  it('keeps a player a play of this game names, even one undone and waiting to be redone', async () => {
    const t = setUp();
    await run(
      t,
      commands([
        addEight[3] as TablePlayerInput,
        { type: 'lineup', side: 'away', playerIds: [twelve] },
        { type: 'undo' },
      ]),
    );
    const result = await run(
      t,
      commands([{ type: 'remove-player', side: 'away', playerId: twelve }], 10),
    );
    expect(reasonOf(result)).toEqual({
      code: 'rule',
      message:
        'This player has plays recorded in this game, so they stay on its list and its box score.',
      problem: 'has-plays',
    });
    expect(t.db.state.roster.map((r) => r.personId)).toContain(twelve);
  });

  it('keeps a player with a box score line anywhere', async () => {
    const t = setUp({
      lines: [
        {
          gameId: gameUuid(5),
          teamId: awayTeamId,
          personId: walkUp(1),
          played: true,
          secondsPlayed: null,
          stats: {},
        },
      ],
    });
    await run(t, commands(addEight.slice(0, 1)));
    const result = await run(
      t,
      commands([{ type: 'remove-player', side: 'away', playerId: walkUp(1) }], 10),
    );
    expect(reasonOf(result)).toMatchObject({ problem: 'has-plays' });
  });

  it('does not take off a player from the team’s own roster, nor one who is not on the team', async () => {
    const t = setUp();
    const rostered = await run(
      t,
      commands([{ type: 'remove-player', side: 'home', playerId: homeIds[0] ?? '' }]),
    );
    expect(reasonOf(rostered)).toMatchObject({ problem: 'not-added-here' });
    const stranger = await run(
      t,
      commands([{ type: 'remove-player', side: 'away', playerId: walkUp(77) }], 10),
    );
    expect(reasonOf(stranger)).toMatchObject({ problem: 'not-on-team' });
    expect(t.db.state.roster).toEqual(homeRoster);
  });

  it('does not take off a player added at another game’s table', async () => {
    const t = setUp({
      roster: [
        ...homeRoster,
        {
          teamId: awayTeamId,
          personId: walkUp(1),
          firstName: '',
          lastName: '',
          jerseyNumber: '3',
          left: false,
        },
      ],
      tableMarks: [
        { teamId: awayTeamId, personId: walkUp(1), addedAtGameId: gameUuid(7), needsReview: true },
      ],
    });
    const result = await run(
      t,
      commands([{ type: 'remove-player', side: 'away', playerId: walkUp(1) }]),
    );
    expect(reasonOf(result)).toMatchObject({ problem: 'not-added-here' });
  });
});

describe('the parts', () => {
  it('splits a typed name into a first word and the rest', () => {
    expect(splitTableName('')).toEqual({ firstName: '', lastName: '' });
    expect(splitTableName('   ')).toEqual({ firstName: '', lastName: '' });
    expect(splitTableName(' Yusuf ')).toEqual({ firstName: 'Yusuf', lastName: '' });
    expect(splitTableName('Mary  Ann   Smith')).toEqual({
      firstName: 'Mary',
      lastName: 'Ann Smith',
    });
  });

  it('finds a player named by any play, in the list or waiting to be redone', () => {
    const id = walkUp(1);
    let state = basketball.newGame(basketball.DEFAULT_RULES, 0);
    expect(namedInState(state, id)).toBe(false);
    state = basketball.apply(
      state,
      { type: 'lineup', side: 'away', playerIds: [id] },
      { id: 'a', now: 0 },
    );
    expect(namedInState(state, id)).toBe(true);
    state = basketball.apply(state, { type: 'undo' }, { id: 'b', now: 0 });
    expect(namedInState(state, id)).toBe(true);
    expect(namedInState(state, walkUp(2))).toBe(false);
  });
});
