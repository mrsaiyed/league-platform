import { describe, expect, it } from 'vitest';
import {
  ClockReference,
  CommandBatch,
  CommandBatchV1,
  CommandReply,
  GameSnapshotReading,
  LiveMessageReading,
  TrackerRosters,
  isTablePlayerCommand,
  type BatchCommand,
  GameSnapshot,
  LiveMessage,
  ProtocolProbe,
  SessionReply,
  SessionRequest,
  TrackerGameState,
  TrackerRefusal,
  VersionRefusal,
  buildVersionRefusal,
  isAcceptedProtocolVersion,
  maxCommandsPerBatch,
  ownTrackerRefusal,
  trackerProtocolVersion,
  trackerRefusalStatus,
} from '../index.ts';

const id = (n: number) => `0192f000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const tap = (n: number, input: object = { type: 'start' }) => ({
  commandId: id(n),
  at: 1_700_000_000_000 + n,
  input,
});

describe('command batch', () => {
  const ok = {
    protocolVersion: 1,
    sessionId: id(99),
    commands: [tap(1), tap(2, { type: 'foul', side: 'home', playerId: id(5) })],
  };
  it('takes commands from the existing contract, with their IDs and tap times', () => {
    expect(CommandBatch.safeParse(ok).success).toBe(true);
  });
  it('needs a tap time on every command', () => {
    const { at: _at, ...noTime } = tap(1);
    expect(CommandBatch.safeParse({ ...ok, commands: [noTime] }).success).toBe(false);
  });
  it('refuses an unknown command, an empty batch and a batch that is too long', () => {
    expect(CommandBatch.safeParse({ ...ok, commands: [tap(1, { type: 'dunk' })] }).success).toBe(
      false,
    );
    expect(CommandBatch.safeParse({ ...ok, commands: [] }).success).toBe(false);
    const many = Array.from({ length: maxCommandsPerBatch + 1 }, (_, i) => tap(i + 1));
    expect(CommandBatch.safeParse({ ...ok, commands: many }).success).toBe(false);
  });
  it('refuses unknown keys and a bad session', () => {
    expect(CommandBatch.safeParse({ ...ok, extra: 1 }).success).toBe(false);
    expect(CommandBatch.safeParse({ ...ok, sessionId: 'nope' }).success).toBe(false);
  });
});

describe('players at the scorer’s table (version 2, record 058)', () => {
  const batch = (...commands: object[]) => ({ protocolVersion: 2, sessionId: id(99), commands });
  const add = (fields: object) =>
    tap(1, {
      type: 'add-player',
      side: 'away',
      playerId: id(50),
      jersey: '12',
      name: '',
      ...fields,
    });

  it('takes a player added with a number, a name, or both, in the same queue as the taps', () => {
    for (const fields of [{}, { jersey: '', name: 'Yusuf Ali' }, { name: 'Yusuf Ali' }]) {
      expect(CommandBatch.safeParse(batch(add(fields), tap(2))).success).toBe(true);
    }
    expect(isTablePlayerCommand(add({}) as BatchCommand)).toBe(true);
    expect(isTablePlayerCommand(tap(2) as BatchCommand)).toBe(false);
  });

  it('refuses a player with neither, a number that is not a jersey, and a device-made id that is not one', () => {
    expect(CommandBatch.safeParse(batch(add({ jersey: '', name: '  ' }))).success).toBe(false);
    expect(CommandBatch.safeParse(batch(add({ jersey: '123' }))).success).toBe(false);
    expect(CommandBatch.safeParse(batch(add({ playerId: 'twelve' }))).success).toBe(false);
    expect(CommandBatch.safeParse(batch(add({ team: id(3) }))).success).toBe(false);
  });

  it('takes a change of number or name, and taking a player off the list', () => {
    const change = (fields: object) =>
      tap(3, { type: 'change-player', side: 'home', playerId: id(50), ...fields });
    expect(CommandBatch.safeParse(batch(change({ jersey: '5' }))).success).toBe(true);
    expect(CommandBatch.safeParse(batch(change({ jersey: '' }))).success).toBe(true);
    expect(CommandBatch.safeParse(batch(change({ name: 'Sam Lee' }))).success).toBe(true);
    expect(CommandBatch.safeParse(batch(change({}))).success).toBe(false);
    const remove = tap(4, { type: 'remove-player', side: 'home', playerId: id(50) });
    expect(CommandBatch.safeParse(batch(remove)).success).toBe(true);
  });

  it('keeps version 1 as it was: taps only (T-127)', () => {
    expect(CommandBatchV1.safeParse({ ...batch(tap(1)), protocolVersion: 1 }).success).toBe(true);
    expect(CommandBatchV1.safeParse({ ...batch(add({})), protocolVersion: 1 }).success).toBe(false);
  });

  it('takes a long name in the batch, as the server measures it once tidied', () => {
    expect(CommandBatch.safeParse(batch(add({ name: 'x'.repeat(400) }))).success).toBe(true);
    expect(CommandBatch.safeParse(batch(add({ name: 'x'.repeat(401) }))).success).toBe(false);
  });

  it('says why a change of players was refused, who wears a number, and what a refusal follows', () => {
    const wornBy = { playerId: id(7), jersey: '5', name: 'Jordan Ellis' };
    const reply = {
      protocolVersion: 2,
      sequence: 3,
      results: [
        {
          commandId: id(1),
          status: 'refused',
          reason: {
            code: 'rule',
            message: 'That number is already worn on this team, which wants unique numbers.',
            problem: 'jersey-taken',
            wornBy,
          },
        },
        {
          commandId: id(2),
          status: 'refused',
          reason: {
            code: 'rule',
            message: 'This names a player whose adding was refused earlier in the batch.',
            problem: 'player-not-added',
            playerId: id(50),
            follows: id(1),
          },
        },
        // S-44: a player added with a number already worn is taken, with a notice.
        {
          commandId: id(3),
          status: 'accepted',
          notice: { kind: 'jersey-also-worn', wornBy },
        },
      ],
    };
    expect(CommandReply.safeParse(reply).success).toBe(true);
    const unknown = structuredClone(reply);
    (unknown.results[0]?.reason as { problem: string }).problem = 'too-tall';
    expect(CommandReply.safeParse(unknown).success).toBe(false);
    const bareWearer = structuredClone(reply);
    (bareWearer.results[0]?.reason as { wornBy: unknown }).wornBy = id(7);
    expect(CommandReply.safeParse(bareWearer).success).toBe(false);
  });

  it('gives the rosters for the device, a player known by number only included', () => {
    const rosters = {
      gameId: id(1),
      homeTeamId: id(2),
      awayTeamId: id(3),
      recording: 'live',
      status: 'scheduled',
      uniqueJerseys: true,
      allowTies: false,
      players: [
        {
          teamId: id(3),
          personId: id(50),
          firstName: '',
          lastName: '',
          jerseyNumber: '12',
          left: false,
          addedAtGameId: id(1),
          toReview: true,
        },
        {
          teamId: id(2),
          personId: id(51),
          firstName: 'Ada',
          lastName: 'Lionel',
          jerseyNumber: null,
          left: true,
          addedAtGameId: null,
          toReview: false,
        },
      ],
    };
    expect(TrackerRosters.parse(rosters)).toEqual(rosters);
    const { recording: _r, ...unknownMode } = rosters;
    expect(TrackerRosters.safeParse(unknownMode).success).toBe(true);
    const badNumber = { ...rosters, players: [{ ...rosters.players[0], jerseyNumber: '' }] };
    expect(TrackerRosters.safeParse(badNumber).success).toBe(false);
    // What the Players panel needs is part of the shape from the start (T-127).
    const { uniqueJerseys: _u, ...noRule } = rosters;
    expect(TrackerRosters.safeParse(noRule).success).toBe(false);
    // And whether a level score may end the game (S-73): the device refuses End by it.
    const { allowTies: _a, ...noTieRule } = rosters;
    expect(TrackerRosters.safeParse(noTieRule).success).toBe(false);
    const { toReview: _t, ...noMark } = rosters.players[0] ?? {};
    expect(TrackerRosters.safeParse({ ...rosters, players: [noMark] }).success).toBe(false);
  });
});

describe('protocol version (T-127)', () => {
  it('accepts the current and the previous version only', () => {
    expect(isAcceptedProtocolVersion(3, 3)).toBe(true);
    expect(isAcceptedProtocolVersion(2, 3)).toBe(true);
    expect(isAcceptedProtocolVersion(1, 3)).toBe(false);
    expect(isAcceptedProtocolVersion(4, 3)).toBe(false);
    expect(isAcceptedProtocolVersion(0, 1)).toBe(false);
    expect(isAcceptedProtocolVersion(1.5, 2)).toBe(false);
  });
  it('accepts the version the tracker speaks today, and the one before it', () => {
    expect(isAcceptedProtocolVersion(trackerProtocolVersion)).toBe(true);
    expect(trackerProtocolVersion).toBe(2);
    expect(isAcceptedProtocolVersion(1)).toBe(true);
  });
  it('has a shape for turning a whole batch away', () => {
    const refusal = { error: 'unsupported-protocol-version', accepted: [2, 3] };
    expect(VersionRefusal.safeParse(refusal).success).toBe(true);
  });
});

describe("the server's own refusals (T-251)", () => {
  it('reads each one only with its body at its own status', () => {
    const own: [number, object][] = [
      [401, { error: 'signed-out' }],
      [403, { error: 'not-allowed' }],
      [403, { error: 'account-problem' }],
      [404, { error: 'not-found' }],
      [400, { error: 'invalid-input', issues: [{ path: 'commands', problem: 'too_small' }] }],
    ];
    for (const [status, body] of own) {
      expect(ownTrackerRefusal(status, body)).toEqual(body);
      expect(TrackerRefusal.safeParse(body).success).toBe(true);
    }
  });

  it('is not ours: a page, another body, or our body at another status', () => {
    const foreign: [number, unknown][] = [
      [404, undefined],
      [404, '<html>Not Found</html>'],
      [403, { error: 'forbidden' }],
      [404, { error: 'not-found', message: 'Not Found' }],
      [403, { error: 'not-found' }],
      [404, { error: 'not-allowed' }],
      [400, { error: 'invalid-input' }],
      [401, { error: 'signed-out', redirect: '/wifi-login' }],
      [401, { error: 'account-problem' }],
    ];
    for (const [status, body] of foreign) expect(ownTrackerRefusal(status, body)).toBeNull();
    expect(Object.values(trackerRefusalStatus).sort()).toEqual([400, 401, 403, 403, 404]);
  });
});

describe('batch with repeated IDs', () => {
  it('is refused when two commands share an ID', () => {
    const dup = { protocolVersion: 1, sessionId: id(99), commands: [tap(1), tap(1)] };
    expect(CommandBatch.safeParse(dup).success).toBe(false);
  });
});

describe('version probe and refusal builder', () => {
  it('reads only the version, whatever else the body holds', () => {
    expect(ProtocolProbe.safeParse({ protocolVersion: 9, stuff: [1] }).success).toBe(true);
    expect(ProtocolProbe.safeParse({ stuff: 1 }).success).toBe(false);
  });
  it('lists the versions the server takes', () => {
    expect(buildVersionRefusal(3).accepted).toEqual([2, 3]);
    expect(buildVersionRefusal(1).accepted).toEqual([1]);
    expect(VersionRefusal.safeParse(buildVersionRefusal(1)).success).toBe(true);
  });
});

describe('command reply', () => {
  it('carries accepted, duplicate and refused with a reason, and the new sequence', () => {
    const reply = {
      protocolVersion: 1,
      sequence: 12,
      results: [
        { commandId: id(1), status: 'accepted' },
        { commandId: id(2), status: 'duplicate' },
        {
          commandId: id(3),
          status: 'refused',
          reason: { code: 'rule', message: 'Player is not on the court.' },
        },
      ],
    };
    expect(CommandReply.safeParse(reply).success).toBe(true);
  });
  it('refuses a refusal without a reason, with an unknown one, or an unknown status', () => {
    const base = { protocolVersion: 1, sequence: 1 };
    const parse = (result: object) =>
      CommandReply.safeParse({ ...base, results: [result] }).success;
    expect(parse({ commandId: id(1), status: 'refused' })).toBe(false);
    expect(
      parse({ commandId: id(1), status: 'refused', reason: { code: 'because', message: '' } }),
    ).toBe(false);
    expect(parse({ commandId: id(1), status: 'maybe' })).toBe(false);
  });
  it('refuses a negative sequence', () => {
    const reply = {
      protocolVersion: 1,
      sequence: -1,
      results: [{ commandId: id(1), status: 'accepted' }],
    };
    expect(CommandReply.safeParse(reply).success).toBe(false);
  });
});

describe('scoring session messages', () => {
  it('accepts each request', () => {
    for (const r of [
      { type: 'open', deviceId: 'tablet-1' },
      { type: 'renew', sessionId: id(2) },
      { type: 'take-over', deviceId: 'tablet-1', confirmed: true, expectedHolderSince: 5 },
      { type: 'release', sessionId: id(2) },
    ]) {
      expect(SessionRequest.safeParse(r).success).toBe(true);
    }
  });
  it('names the device, never the game: the address names that', () => {
    expect(SessionRequest.safeParse({ type: 'open' }).success).toBe(false);
    expect(SessionRequest.safeParse({ type: 'open', deviceId: '  ' }).success).toBe(false);
    expect(
      SessionRequest.safeParse({ type: 'open', deviceId: 'tablet-1', gameId: id(1) }).success,
    ).toBe(false);
  });
  it('will not take over without the scorekeeper confirming', () => {
    const noConfirm = {
      type: 'take-over',
      deviceId: 'tablet-1',
      confirmed: false,
      expectedHolderSince: 5,
    };
    expect(SessionRequest.safeParse(noConfirm).success).toBe(false);
    expect(
      SessionRequest.safeParse({ type: 'take-over', deviceId: 'tablet-1', expectedHolderSince: 5 })
        .success,
    ).toBe(false);
  });
  it('accepts each reply', () => {
    for (const r of [
      { status: 'held-by-you', sessionId: id(2), expiresAt: 1_700_000_120_000, sentAt: 1 },
      {
        status: 'held-by-other',
        holder: { displayName: 'Sam', since: 1_700_000_000_000 },
        sentAt: 1,
      },
      { status: 'ended', reason: 'taken-over', sentAt: 1 },
      { status: 'refused', code: 'not-allowed', sentAt: 1 },
      { status: 'refused', code: 'game-not-live', sentAt: 1 },
    ]) {
      expect(SessionReply.safeParse(r).success).toBe(true);
    }
    expect(SessionReply.safeParse({ status: 'ended', reason: 'bored', sentAt: 1 }).success).toBe(
      false,
    );
  });
});

describe('clock reference', () => {
  it('is either running from an instant or stopped', () => {
    const running = { state: 'running', remainingMs: 462_000, asOf: 1_700_000_000_000 };
    expect(ClockReference.safeParse(running).success).toBe(true);
    expect(ClockReference.safeParse({ state: 'stopped', remainingMs: 462_000 }).success).toBe(true);
    expect(ClockReference.safeParse({ state: 'running', remainingMs: 462_000 }).success).toBe(
      false,
    );
    expect(ClockReference.safeParse({ state: 'stopped', remainingMs: -1 }).success).toBe(false);
  });
});

describe('live message and snapshot', () => {
  const msg = {
    gameId: id(1),
    sequence: 7,
    sentAt: 1_700_000_000_000,
    status: 'live',
    score: { home: 12, away: 9 },
    period: 2,
    clock: { state: 'running', remainingMs: 462_000, asOf: 1_700_000_000_000 },
    teamFouls: { home: 3, away: 4 },
    latestPlay: { type: 'score', side: 'home', playerName: 'A. Player', jersey: '23', points: 2 },
  };
  it('accepts a message, with or without a latest play', () => {
    expect(LiveMessage.safeParse(msg).success).toBe(true);
    expect(LiveMessage.safeParse({ ...msg, latestPlay: null }).success).toBe(true);
  });
  it('allows a hidden name and number', () => {
    const hidden = { type: 'foul', side: 'away', playerName: null, jersey: null };
    expect(LiveMessage.safeParse({ ...msg, latestPlay: hidden }).success).toBe(true);
  });
  it('takes a latest play only with a real jersey or null', () => {
    const play = (jersey: string | null) => ({ type: 'foul', playerName: null, jersey });
    expect(LiveMessage.safeParse({ ...msg, latestPlay: play('') }).success).toBe(false);
    expect(LiveMessage.safeParse({ ...msg, latestPlay: play('123') }).success).toBe(false);
    expect(LiveMessage.safeParse({ ...msg, latestPlay: play('00') }).success).toBe(true);
  });
  it('refuses a message missing its number or with extra keys', () => {
    const { sequence: _s, ...noSeq } = msg;
    expect(LiveMessage.safeParse(noSeq).success).toBe(false);
    expect(LiveMessage.safeParse({ ...msg, internalNote: 'x' }).success).toBe(false);
  });
  it('refuses a bad status, score or period', () => {
    expect(LiveMessage.safeParse({ ...msg, status: 'paused' }).success).toBe(false);
    expect(LiveMessage.safeParse({ ...msg, score: { home: -1, away: 0 } }).success).toBe(false);
    expect(LiveMessage.safeParse({ ...msg, period: 0 }).success).toBe(false);
  });
  it('makes a snapshot of a message plus the teams and players', () => {
    const snap = {
      ...msg,
      periods: 4,
      teams: {
        home: { name: 'Home', statsVisible: true },
        away: { name: 'Away', statsVisible: false },
      },
      players: [
        {
          playerId: id(5),
          side: 'home',
          name: null,
          jersey: '23',
          points: null,
          fouls: null,
          onCourt: true,
        },
      ],
      correctedOn: '2026-11-15',
    };
    expect(GameSnapshot.safeParse(snap).success).toBe(true);
    const many = Array.from({ length: 200 }, () => snap.players[0]);
    expect(GameSnapshot.safeParse({ ...snap, players: many }).success).toBe(true);
    expect(GameSnapshot.safeParse({ ...snap, players: [...many, many[0]] }).success).toBe(false);
    expect(GameSnapshot.safeParse({ ...snap, correctedOn: 'yesterday' }).success).toBe(false);
    expect(GameSnapshot.safeParse({ ...snap, periods: 3 }).success).toBe(false);
  });
  it('is read by a page leaving out any field it does not know, at every level (record 058)', () => {
    const player = {
      playerId: id(5),
      side: 'away',
      name: null,
      jersey: '12',
      points: 2,
      fouls: 0,
      onCourt: true,
    };
    const snap = {
      ...msg,
      periods: 4,
      teams: {
        home: { name: 'Home', statsVisible: true },
        away: { name: 'Away', statsVisible: true },
      },
      players: [player],
    };
    const later = {
      ...snap,
      added: 1,
      clock: { ...snap.clock, drift: 0 },
      latestPlay: { ...snap.latestPlay, assist: null },
      score: { ...snap.score, extra: 0 },
      teams: { ...snap.teams, home: { ...snap.teams.home, colour: '#000000' } },
      players: [{ ...player, unnamed: true, minutes: 4 }],
    };
    expect(GameSnapshot.safeParse(later).success).toBe(false);
    expect(GameSnapshotReading.parse(later)).toEqual({
      ...snap,
      players: [{ ...player, unnamed: true }],
    });
    expect(LiveMessage.safeParse({ ...msg, added: 1 }).success).toBe(false);
    expect(LiveMessageReading.parse({ ...msg, added: 1 })).toEqual(msg);
    // Still the same checks on what it does know.
    expect(LiveMessageReading.safeParse({ ...msg, sequence: -1 }).success).toBe(false);
    expect(GameSnapshotReading.parse(snap)).toEqual(snap);
  });

  it('marks a player known by number only, and only as true (S-34)', () => {
    const player = {
      playerId: id(5),
      side: 'away',
      name: null,
      jersey: '12',
      points: 2,
      fouls: 0,
      onCourt: true,
    };
    const snap = {
      ...msg,
      periods: 4,
      teams: {
        home: { name: 'Home', statsVisible: true },
        away: { name: 'Away', statsVisible: true },
      },
      players: [{ ...player, unnamed: true }],
    };
    expect(GameSnapshot.safeParse(snap).success).toBe(true);
    expect(GameSnapshot.safeParse({ ...snap, players: [player] }).success).toBe(true);
    expect(
      GameSnapshot.safeParse({ ...snap, players: [{ ...player, unnamed: false }] }).success,
    ).toBe(false);
  });
});

describe('the engine’s state for the tracker (T-253)', () => {
  const state = {
    version: 1,
    status: 'live',
    rules: { periods: 4, periodSeconds: 480 },
    clock: { remainingMs: 480_000, running: false, anchorAt: 0, elapsedMs: 0 },
    plays: [],
    redo: [],
    colorsSwapped: false,
    recent: [],
    lastAt: 0,
  };

  it('carries the sequence number and the engine’s document as it is', () => {
    expect(TrackerGameState.parse({ sequence: 3, state })).toEqual({ sequence: 3, state });
  });

  it('refuses a document that is not the engine’s version 1', () => {
    for (const bad of [{ ...state, version: 2 }, { ...state, plays: undefined }, null]) {
      expect(TrackerGameState.safeParse({ sequence: 0, state: bad }).success).toBe(false);
    }
    expect(TrackerGameState.safeParse({ sequence: -1, state }).success).toBe(false);
  });
});

describe('the platform’s command shape at the door (record 062, T-128)', () => {
  const batch = (protocolVersion: number, ...commands: object[]) => ({
    protocolVersion,
    sessionId: id(99),
    commands,
  });
  const switchTo = (mode: string) => tap(1, { type: 'clock-mode', mode });

  it('version 2 takes the clock-mode switch, still at version 2', () => {
    expect(trackerProtocolVersion).toBe(2);
    expect(CommandBatch.safeParse(batch(2, switchTo('running'), tap(2))).success).toBe(true);
    expect(CommandBatch.safeParse(batch(2, switchTo('stop'))).success).toBe(true);
    expect(CommandBatch.safeParse(batch(2, switchTo('fast'))).success).toBe(false);
    expect(isTablePlayerCommand(switchTo('running') as BatchCommand)).toBe(false);
  });

  it('keeps every tap the present tracker sends, in version 1 and 2 alike (T-127)', () => {
    const present = [
      tap(1, { type: 'lineup', side: 'home', playerIds: [id(5)] }),
      tap(2, { type: 'score', side: 'home', playerId: id(5), points: 3 }),
      tap(3, { type: 'foul', side: 'home', playerId: id(5) }),
      tap(4, { type: 'timeout', side: 'away', seconds: 30 }),
      tap(5, { type: 'set-clock', ms: 30_000 }),
      tap(6, { type: 'end' }),
    ];
    expect(CommandBatch.safeParse(batch(2, ...present)).success).toBe(true);
    expect(CommandBatchV1.safeParse(batch(1, ...present)).success).toBe(true);
  });

  it('keeps version 1 as it was: the first tracker’s shape, which has no switch', () => {
    expect(CommandBatchV1.safeParse(batch(1, switchTo('running'))).success).toBe(false);
  });
});
