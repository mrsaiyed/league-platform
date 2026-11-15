// Players at the scorer's table (step 2.117; P7 §2 and §5.2; S-6, S-34, S-37; record
// 058, T-261), through the tracker's own batch: a visiting team with no roster is
// entered by number only and scored, a retry adds no one twice, a number already worn
// is refused naming who wears it, and only whoever may score the game, for its two
// teams, changes anything. The same against the real database is in packages/database
// (stores/table-players-commands.test.ts, the two-league harness and the role matrix).
import {
  CommandBatchV1,
  CommandReply,
  seasonRulesPreset,
  type BatchCommand,
  type CommandResult,
  type TablePlayerInput,
  type TrackerCommand,
} from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { applyTrackerCommands } from './commands/apply-tracker-commands.ts';
import { reopenGame } from './commands/reopen-game.ts';
import { setBoxScore } from './commands/set-box-score.ts';
import {
  awayTeamId,
  editorGrant,
  editorId,
  game,
  gameUuid,
  homeTeamId,
  ownerId,
  scorekeeperGrant,
  scorekeeperId,
  scoringRule,
  seasonId,
} from './memory-games.test-helper.ts';
import { sessionUuid, startOfTest } from './memory-scoring.test-helper.ts';
import { memoryTracker, type MemoryTracker } from './memory-tracker.test-helper.ts';
import type { GamePlayer, GameRosterPlayer } from './ports.ts';
import { leaseMs } from './scoring-session.ts';
import { fitWornByName, namedInState, splitTableName } from './table-players.ts';

const gameId = gameUuid(1);
const sessionId = sessionUuid(1);
const homeIds = [1, 2, 3, 4, 5].map((n) => `01900000-0000-7000-8000-00000001000${n}`);
/** The ids the device makes for the visitors it enters by number. */
const walkUp = (n: number) => `01900000-0000-4000-8000-0000000f${String(n).padStart(4, '0')}`;
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

/** A refusal as a tracker of version 1 reads it: a code and a message, nothing else. */
const CommandReplyV1Reason = z.strictObject({
  commandId: z.string(),
  status: z.literal('refused'),
  reason: z.strictObject({ code: z.string(), message: z.string() }),
});

function setUp(state: Partial<MemoryTracker> = {}) {
  const roster = state.roster ?? homeRoster;
  const rules = seasonRulesPreset('high-school');
  // The season's rule, as the command reads it; the store's flag, as the database does.
  const uniqueJerseys = state.uniqueJerseys ?? false;
  return memoryTracker({
    seasons: [
      {
        id: seasonId,
        programId: 'p1',
        rules: { ...rules, rosters: { ...rules.rosters, uniqueJerseys } },
      },
    ],
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

describe('numbers (S-37, S-44)', () => {
  const jordan: GameRosterPlayer = {
    teamId: awayTeamId,
    personId: walkUp(90),
    firstName: 'Jordan',
    lastName: 'Ellis',
    jerseyNumber: '5',
    left: false,
  };

  it('takes a player added with a number already worn, saying who wears it (S-44)', async () => {
    const t = setUp({ uniqueJerseys: true, roster: [...homeRoster, jordan] });
    const list = commands([
      { type: 'add-player', side: 'away', playerId: walkUp(1), jersey: '5', name: '' },
      { type: 'lineup', side: 'away', playerIds: [walkUp(1)] },
    ]);
    const result = await run(t, list);
    expect(resultsOf(result)).toEqual([
      {
        commandId: list[0]?.commandId,
        status: 'accepted',
        notice: {
          kind: 'jersey-also-worn',
          wornBy: { playerId: walkUp(90), jersey: '5', name: 'Jordan Ellis' },
        },
      },
      { commandId: list[1]?.commandId, status: 'accepted' },
    ]);
    // Both wear 5; the new one waits for the admin's review, who sees the clash then.
    expect(t.db.state.roster.filter((r) => r.jerseyNumber === '5')).toHaveLength(2);
    expect(t.db.state.tableMarks).toMatchObject([{ personId: walkUp(1), needsReview: true }]);
  });

  it('refuses a change of number to one already worn where the season wants unique ones, naming no one in the log', async () => {
    const t = setUp({ uniqueJerseys: true, roster: [...homeRoster, jordan] });
    await run(t, commands(addEight.slice(0, 1)));
    const change = await run(
      t,
      commands(
        [
          { type: 'change-player', side: 'away', playerId: walkUp(1), jersey: '5' },
          { type: 'change-player', side: 'away', playerId: walkUp(1), jersey: '6' },
        ],
        10,
      ),
    );
    expect(statusesOf(change)).toEqual(['refused', 'accepted']);
    expect(reasonOf(change)).toEqual({
      code: 'rule',
      message: 'That number is already worn on this team, which wants unique numbers.',
      problem: 'jersey-taken',
      wornBy: { playerId: walkUp(90), jersey: '5', name: 'Jordan Ellis' },
    });
    expect(reasonOf(change)?.message).not.toContain('Jordan');
    expect(t.db.state.roster.find((r) => r.personId === walkUp(1))?.jerseyNumber).toBe('6');
  });

  it('takes two of the same number, and a change to one, where the season does not ask for unique ones', async () => {
    const t = setUp({ roster: [...homeRoster, jordan] });
    const list = commands([
      { type: 'add-player', side: 'away', playerId: walkUp(1), jersey: '5', name: '' },
      { type: 'add-player', side: 'away', playerId: walkUp(2), jersey: '6', name: '' },
      { type: 'change-player', side: 'away', playerId: walkUp(2), jersey: '5' },
    ]);
    expect(statusesOf(await run(t, list))).toEqual(['accepted', 'accepted', 'accepted']);
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

describe('names (S-34, S-45)', () => {
  it('renames a player added at the table and waiting for review, keeping the name before', async () => {
    const t = setUp();
    await run(t, commands([{ ...addEight[0], name: 'Sam Lee' } as TablePlayerInput]));
    const renamed = await run(
      t,
      commands(
        [{ type: 'change-player', side: 'away', playerId: walkUp(1), name: '  Samir   Lee ' }],
        10,
      ),
    );
    expect(statusesOf(renamed)).toEqual(['accepted']);
    expect(t.db.state.roster.find((r) => r.personId === walkUp(1))).toMatchObject({
      firstName: 'Samir',
      lastName: 'Lee',
      jerseyNumber: '3',
    });
    // Where an admin's review finds it: on the person, never in the log or the events.
    expect(t.db.state.previousNames).toEqual([
      { personId: walkUp(1), firstName: 'Sam', lastName: 'Lee' },
    ]);
    expect(JSON.stringify([t.db.state.events, t.db.state.activity])).not.toMatch(/Sam/);
    expect(t.db.state.tableMarks).toMatchObject([{ personId: walkUp(1), needsReview: true }]);
  });

  it('renames no player of the team’s own roster, and none an admin has reviewed', async () => {
    const reviewed: GameRosterPlayer = {
      teamId: awayTeamId,
      personId: walkUp(1),
      firstName: 'Kept',
      lastName: 'Name',
      jerseyNumber: '3',
      left: false,
    };
    const t = setUp({
      roster: [...homeRoster, reviewed],
      tableMarks: [
        { teamId: awayTeamId, personId: walkUp(1), addedAtGameId: gameUuid(7), needsReview: false },
      ],
    });
    const result = await run(
      t,
      commands([
        { type: 'change-player', side: 'home', playerId: homeIds[0] ?? '', name: 'Someone Else' },
        { type: 'change-player', side: 'away', playerId: walkUp(1), name: 'Someone Else' },
      ]),
    );
    expect(reasonOf(result, 0)).toMatchObject({ code: 'rule', problem: 'on-team-roster' });
    expect(reasonOf(result, 1)).toMatchObject({ code: 'rule', problem: 'reviewed' });
    expect(t.db.state.roster.map((r) => r.firstName)).not.toContain('Someone');
  });

  it('adds a player by name only', async () => {
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

  it('refuses a name that only grows too long once tidied, as one change, never the batch', async () => {
    const t = setUp();
    // "ﬃ" is one character that NFKC turns into three: 40 of them become 120.
    const long = 'ﬃ'.repeat(40);
    expect(long.length).toBeLessThanOrEqual(100);
    const list = commands([
      { type: 'add-player', side: 'away', playerId: walkUp(1), jersey: '3', name: long },
      { type: 'lineup', side: 'home', playerIds: homeIds },
    ]);
    const result = await run(t, list);
    expect(statusesOf(result)).toEqual(['refused', 'accepted']);
    expect(reasonOf(result)).toMatchObject({ problem: 'name-not-readable' });
  });
});

describe('a change refused, and what names that player after it (S-44)', () => {
  it('refuses every later command naming a player whose adding was refused, pointing at that change', async () => {
    const t = setUp({ otherLeaguePeople: [walkUp(1)] });
    const list = commands([
      { type: 'add-player', side: 'away', playerId: walkUp(1), jersey: '3', name: '' },
      { type: 'lineup', side: 'away', playerIds: [walkUp(1)] },
      { type: 'change-player', side: 'away', playerId: walkUp(1), jersey: '4' },
      { type: 'lineup', side: 'home', playerIds: homeIds },
    ]);
    const result = await run(t, list);
    expect(statusesOf(result)).toEqual(['refused', 'refused', 'refused', 'accepted']);
    // An id of another league's person: refused, and nothing written anywhere.
    expect(reasonOf(result, 0)).toMatchObject({ problem: 'player-id-taken' });
    for (const n of [1, 2]) {
      expect(reasonOf(result, n)).toMatchObject({
        code: 'rule',
        problem: 'player-not-added',
        playerId: walkUp(1),
        follows: list[0]?.commandId,
      });
    }
    expect(t.db.state.roster.map((r) => r.personId)).not.toContain(walkUp(1));
  });

  it('says which player a play names who is not on the team, never only "not on this team"', async () => {
    const t = setUp();
    const result = await run(
      t,
      commands([{ type: 'lineup', side: 'away', playerIds: [walkUp(9)] }]),
    );
    expect(reasonOf(result)).toEqual({
      code: 'rule',
      message: 'That player is not on this team. Reload the roster.',
      problem: 'not-on-team',
      playerId: walkUp(9),
    });
  });

  it('says nothing of the kind to a tracker of version 1, which would not read it (T-127)', async () => {
    const t = setUp();
    const result = await applyTrackerCommands(
      t.as(scorekeeperId),
      {
        ...batchOf(commands([{ type: 'lineup', side: 'away', playerIds: [walkUp(9)] }])),
        protocolVersion: 1,
      },
      t.deps,
    );
    if (!result.ok) throw new Error(result.error.code);
    expect(CommandReplyV1Reason.safeParse(result.value.results[0]).success).toBe(true);
  });

  it('answers a change the database could not save as that change refused, never a fault of the batch', async () => {
    const t = setUp({ failWrites: true });
    const list = commands([
      addEight[0] as TablePlayerInput,
      { type: 'lineup', side: 'home', playerIds: homeIds },
    ]);
    const result = await run(t, list);
    expect(statusesOf(result)).toEqual(['refused', 'accepted']);
    expect(reasonOf(result)).toMatchObject({ problem: 'not-saved' });
  });
});

describe('after the end (review, item 3)', () => {
  it('takes no change of players after the game was ended in the same batch', async () => {
    const t = setUp();
    const list = commands([
      { type: 'lineup', side: 'home', playerIds: homeIds },
      { type: 'start' },
      { type: 'score', side: 'home', playerId: homeIds[0] ?? '', points: 2 },
      { type: 'end' },
      addEight[0] as TablePlayerInput,
      { type: 'change-player', side: 'home', playerId: homeIds[0] ?? '', jersey: '44' },
    ]);
    const result = await run(t, list);
    expect(statusesOf(result).slice(4)).toEqual(['refused', 'refused']);
    expect(reasonOf(result, 4)).toMatchObject({ problem: 'game-over' });
    expect(reasonOf(result, 5)).toMatchObject({ problem: 'game-over' });
    expect(t.db.state.roster).toEqual(homeRoster);
  });
});

describe('changes of players are not plays (review, item 2)', () => {
  it('saves no state for a batch of them alone, and numbers the next batch on from their events', async () => {
    const t = setUp();
    await run(t, commands(addEight.slice(0, 2)));
    expect(t.db.state.states).toEqual([]);
    expect(t.db.state.events.map((e) => e.seq)).toEqual([1, 2]);
    await run(t, commands([{ type: 'lineup', side: 'home', playerIds: homeIds }], 10));
    expect(t.db.state.events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(t.db.state.states[0]?.seq).toBe(3);
  });

  it('reopens a game entered from paper after only players were added at its table as a game entered by hand', async () => {
    const t = setUp();
    await run(t, commands(addEight.slice(0, 1)));
    // A state of such a game saved before this fix: reopening must still not take it for tracked.
    t.db.state.states.push({
      gameId,
      seq: 1,
      state: basketball.newGame(basketball.DEFAULT_RULES, 0),
    });
    const box = await setBoxScore(
      t.as(scorekeeperId),
      {
        gameId,
        version: 1,
        homeScore: 2,
        awayScore: 0,
        lines: [
          {
            teamId: homeTeamId,
            personId: homeIds[0] ?? '',
            played: true,
            secondsPlayed: null,
            stats: { points: 2 },
          },
        ],
      },
      t.deps,
    );
    expect(box).toMatchObject({ ok: true });
    const version = t.db.state.games[0]?.version ?? 0;
    const reopened = await reopenGame(
      t.as(ownerId),
      { gameId, version, reason: 'A wrong score on the sheet' },
      t.deps,
    );
    expect(reopened).toMatchObject({ ok: true });
    expect(t.db.state.games[0]).toMatchObject({ status: 'scheduled' });
    expect(t.db.state.lines).toHaveLength(1);
    expect(t.db.state.events.map((e) => e.type)).toEqual(['add-player']);
  });
});

describe('taking a player off (S-45)', () => {
  it('takes off a player added here by mistake, to the bin, and a play naming them after is refused', async () => {
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
    expect(t.db.state.binnedPeople).toEqual([walkUp(2)]);
    expect(t.db.state.tableMarks.map((m) => m.personId)).toEqual([walkUp(1)]);
    expect(t.db.state.events.at(-1)).toMatchObject({
      type: 'remove-player',
      payload: { side: 'away', playerId: walkUp(2) },
    });
  });

  it('takes off one added at an earlier game’s table, still waiting for review', async () => {
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
    expect(statusesOf(result)).toEqual(['accepted']);
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

  it('judges by the batch’s own plays: undone and replaced in the batch, the player can go (item 7)', async () => {
    const t = setUp();
    const twentyOne = walkUp(6);
    await run(
      t,
      commands([
        ...addEight,
        { type: 'lineup', side: 'home', playerIds: homeIds },
        { type: 'lineup', side: 'away', playerIds: [twentyOne] },
        { type: 'start' },
        { type: 'score', side: 'away', playerId: twentyOne, points: 2 },
      ]),
    );
    expect(t.db.state.liveLines.map((l) => l.personId)).toContain(twentyOne);
    // Offline: undo the basket and the lineup, a basket for #12 (which empties redo),
    // then #21 is taken off. No play of the batch's state names #21 any more.
    const result = await run(
      t,
      commands(
        [
          { type: 'undo' },
          { type: 'undo' },
          { type: 'lineup', side: 'away', playerIds: [twelve] },
          { type: 'score', side: 'away', playerId: twelve, points: 2 },
          { type: 'remove-player', side: 'away', playerId: twentyOne },
        ],
        30,
      ),
    );
    expect(statusesOf(result)).toEqual([
      'accepted',
      'accepted',
      'accepted',
      'accepted',
      'accepted',
    ]);
    expect(t.db.state.liveLines.map((l) => l.personId)).not.toContain(twentyOne);
  });

  it('keeps a player with a line in another game, and says that, not "plays in this game"', async () => {
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
    expect(reasonOf(result)).toMatchObject({ problem: 'has-lines' });
  });

  it('does not take off a player of the team’s own roster, one reviewed, nor one not on the team', async () => {
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
        { teamId: awayTeamId, personId: walkUp(1), addedAtGameId: gameId, needsReview: false },
      ],
    });
    const result = await run(
      t,
      commands([
        { type: 'remove-player', side: 'home', playerId: homeIds[0] ?? '' },
        { type: 'remove-player', side: 'away', playerId: walkUp(1) },
        { type: 'remove-player', side: 'away', playerId: walkUp(77) },
      ]),
    );
    expect(reasonOf(result, 0)).toMatchObject({ problem: 'on-team-roster' });
    expect(reasonOf(result, 1)).toMatchObject({ problem: 'reviewed' });
    expect(reasonOf(result, 2)).toMatchObject({ problem: 'not-on-team' });
    expect(t.db.state.binnedPeople).toEqual([]);
  });
});

describe('the second review’s fixes', () => {
  it('keeps a walk-up with a line in this game’s paper box score while it has no engine state (M1)', async () => {
    const t = setUp();
    await run(t, commands(addEight.slice(0, 1)));
    expect(t.db.state.states).toEqual([]);
    // The game is entered from paper, with a line for the walk-up.
    t.db.state.lines.push({
      gameId,
      teamId: awayTeamId,
      personId: walkUp(1),
      played: true,
      secondsPlayed: null,
      stats: { points: 4 },
    });
    const result = await run(
      t,
      commands([{ type: 'remove-player', side: 'away', playerId: walkUp(1) }], 10),
    );
    expect(reasonOf(result)).toEqual({
      code: 'rule',
      message:
        'This player has a line in this game’s box score, entered by hand, so they stay on its list.',
      problem: 'in-box-score',
    });
    expect(t.db.state.binnedPeople).toEqual([]);
    expect(t.db.state.roster.map((r) => r.personId)).toContain(walkUp(1));
  });

  it('changes a number and a name together or not at all (L1)', async () => {
    const t = setUp({ failRenames: true });
    await run(t, commands(addEight.slice(0, 1)));
    const result = await run(
      t,
      commands(
        [{ type: 'change-player', side: 'away', playerId: walkUp(1), jersey: '44', name: 'Sam' }],
        10,
      ),
    );
    expect(reasonOf(result)).toMatchObject({ problem: 'not-saved' });
    expect(t.db.state.roster.find((r) => r.personId === walkUp(1))?.jerseyNumber).toBe('3');
    expect(t.db.state.events.map((e) => e.type)).toEqual(['add-player']);
  });

  it('keeps the name the player was first given through a second rename (L3)', async () => {
    const t = setUp();
    await run(t, commands([{ ...addEight[0], name: 'Sam Lee' } as TablePlayerInput]));
    for (const [n, name] of [
      [10, 'Samir Lee'],
      [20, 'Samuel Lee'],
    ] as const) {
      await run(
        t,
        commands([{ type: 'change-player', side: 'away', playerId: walkUp(1), name }], n),
      );
    }
    expect(t.db.state.previousNames).toEqual([
      { personId: walkUp(1), firstName: 'Sam', lastName: 'Lee' },
    ]);
    expect(t.db.state.roster.find((r) => r.personId === walkUp(1))?.firstName).toBe('Samuel');
  });

  it('points a later batch’s plays at an add refused in an earlier one, and answers its retry the same (L4)', async () => {
    const t = setUp({ otherLeaguePeople: [walkUp(1)] });
    const [add] = commands([addEight[0] as TablePlayerInput]);
    if (add === undefined) throw new Error('no add');
    const first = await run(t, [add]);
    expect(reasonOf(first)).toMatchObject({ problem: 'player-id-taken' });
    // The batch split: the plays naming the player come in the next one.
    const later = await run(
      t,
      commands(
        [
          { type: 'lineup', side: 'away', playerIds: [walkUp(1)] },
          { type: 'change-player', side: 'away', playerId: walkUp(1), jersey: '4' },
        ],
        10,
      ),
    );
    for (const n of [0, 1]) {
      expect(reasonOf(later, n)).toMatchObject({
        problem: 'player-not-added',
        playerId: walkUp(1),
        follows: add.commandId,
      });
    }
    // The refused add sent again (its answer was lost) is refused again, never a duplicate.
    expect(resultsOf(await run(t, [add]))[0]).toMatchObject({
      status: 'refused',
      reason: { problem: 'player-id-taken' },
    });
    // A refused add is no play: the game can still have its box score entered from paper.
    expect(await t.deps.transaction(t.as(scorekeeperId), (tx) => tx.games.hasPlays(gameId))).toBe(
      false,
    );
    expect(t.db.state.events.map((e) => [e.type, e.payload])).toEqual([
      ['add-player-refused', { side: 'away', playerId: walkUp(1), problem: 'player-id-taken' }],
    ]);
  });

  it('looks at a corrected re-add of the same player itself, in the same batch (L4)', async () => {
    const t = setUp();
    const list = commands([
      { type: 'add-player', side: 'away', playerId: walkUp(1), jersey: '3', name: 'x'.repeat(101) },
      { type: 'add-player', side: 'away', playerId: walkUp(1), jersey: '3', name: 'Sam' },
      { type: 'lineup', side: 'away', playerIds: [walkUp(1)] },
    ]);
    const result = await run(t, list);
    expect(statusesOf(result)).toEqual(['refused', 'accepted', 'accepted']);
    expect(reasonOf(result)).toMatchObject({ problem: 'name-not-readable' });
    // Added after all: a later batch names them as any player.
    const later = await run(
      t,
      commands([{ type: 'change-player', side: 'away', playerId: walkUp(1), jersey: '4' }], 10),
    );
    expect(statusesOf(later)).toEqual(['accepted']);
  });

  it('says a number is also worn only where the season wants unique numbers (L6)', async () => {
    const jordan: GameRosterPlayer = {
      teamId: awayTeamId,
      personId: walkUp(90),
      firstName: 'Jordan',
      lastName: 'Ellis',
      jerseyNumber: '5',
      left: false,
    };
    const t = setUp({ roster: [...homeRoster, jordan] });
    const list = commands([
      { type: 'add-player', side: 'away', playerId: walkUp(1), jersey: '5', name: '' },
    ]);
    expect(resultsOf(await run(t, list))).toEqual([
      { commandId: list[0]?.commandId, status: 'accepted' },
    ]);
  });

  it('cuts a wearer’s long name to fit the reply, never splitting a character (L2)', async () => {
    // 100 characters outside the basic plane each way: what the database keeps, 400 units.
    const long = '𝔸'.repeat(100);
    const wearer: GameRosterPlayer = {
      teamId: awayTeamId,
      personId: walkUp(90),
      firstName: long,
      lastName: long,
      jerseyNumber: '5',
      left: false,
    };
    const t = setUp({ uniqueJerseys: true, roster: [...homeRoster, wearer] });
    const list = commands([
      { type: 'add-player', side: 'away', playerId: walkUp(1), jersey: '5', name: '' },
    ]);
    const result = await run(t, list);
    if (!result.ok) throw new Error(result.error.code);
    expect(CommandReply.safeParse(result.value).success).toBe(true);
    const name = (resultsOf(result)[0] as { notice?: { wornBy: { name: string } } }).notice?.wornBy
      .name;
    expect(name).toBe('𝔸'.repeat(100));
    expect(fitWornByName(`${'𝔸'.repeat(100)} ${'𝔸'.repeat(100)}`).length).toBeLessThanOrEqual(201);
    expect(fitWornByName('a'.repeat(200) + '𝔸')).toBe('a'.repeat(200));
    expect(fitWornByName('Jordan Ellis')).toBe('Jordan Ellis');
  });
});

describe('the parts', () => {
  it('splits a typed name into a first word and the rest, tidied before it is measured', () => {
    expect(splitTableName('')).toEqual({ firstName: '', lastName: '' });
    expect(splitTableName('   ')).toEqual({ firstName: '', lastName: '' });
    expect(splitTableName(' Yusuf ')).toEqual({ firstName: 'Yusuf', lastName: '' });
    expect(splitTableName('Mary  Ann   Smith')).toEqual({
      firstName: 'Mary',
      lastName: 'Ann Smith',
    });
    expect(splitTableName('a'.repeat(100))).toEqual({ firstName: 'a'.repeat(100), lastName: '' });
    expect(splitTableName('a'.repeat(101))).toBeUndefined();
    expect(splitTableName('ﬃ'.repeat(34))).toBeUndefined();
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
