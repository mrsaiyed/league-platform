import { describe, expect, it } from 'vitest';
import {
  ClockReference,
  CommandBatch,
  CommandReply,
  GameSnapshot,
  LiveMessage,
  SessionReply,
  SessionRequest,
  VersionRefusal,
  isAcceptedProtocolVersion,
  maxCommandsPerBatch,
  trackerProtocolVersion,
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

describe('protocol version (T-127)', () => {
  it('accepts the current and the previous version only', () => {
    expect(isAcceptedProtocolVersion(3, 3)).toBe(true);
    expect(isAcceptedProtocolVersion(2, 3)).toBe(true);
    expect(isAcceptedProtocolVersion(1, 3)).toBe(false);
    expect(isAcceptedProtocolVersion(4, 3)).toBe(false);
    expect(isAcceptedProtocolVersion(0, 1)).toBe(false);
    expect(isAcceptedProtocolVersion(1.5, 2)).toBe(false);
  });
  it('accepts the version the tracker speaks today', () => {
    expect(isAcceptedProtocolVersion(trackerProtocolVersion)).toBe(true);
  });
  it('has a shape for turning a whole batch away', () => {
    const refusal = { error: 'unsupported-protocol-version', accepted: [2, 3] };
    expect(VersionRefusal.safeParse(refusal).success).toBe(true);
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
      { type: 'open', gameId: id(1) },
      { type: 'renew', sessionId: id(2) },
      { type: 'take-over', gameId: id(1), confirmed: true },
      { type: 'release', sessionId: id(2) },
    ]) {
      expect(SessionRequest.safeParse(r).success).toBe(true);
    }
  });
  it('will not take over without the scorekeeper confirming', () => {
    const noConfirm = { type: 'take-over', gameId: id(1), confirmed: false };
    expect(SessionRequest.safeParse(noConfirm).success).toBe(false);
    expect(SessionRequest.safeParse({ type: 'take-over', gameId: id(1) }).success).toBe(false);
  });
  it('accepts each reply', () => {
    for (const r of [
      { status: 'held-by-you', sessionId: id(2), expiresAt: 1_700_000_120_000 },
      { status: 'held-by-other', holder: { displayName: 'Sam', since: 1_700_000_000_000 } },
      { status: 'ended', reason: 'taken-over' },
      { status: 'refused', code: 'not-allowed' },
    ]) {
      expect(SessionReply.safeParse(r).success).toBe(true);
    }
    expect(SessionReply.safeParse({ status: 'ended', reason: 'bored' }).success).toBe(false);
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
      teams: { home: { name: 'Home' }, away: { name: 'Away' } },
      players: [
        {
          playerId: id(5),
          side: 'home',
          name: null,
          jersey: '23',
          points: 12,
          fouls: 1,
          onCourt: true,
        },
      ],
      correctedOn: '2026-11-15',
    };
    expect(GameSnapshot.safeParse(snap).success).toBe(true);
    expect(GameSnapshot.safeParse({ ...snap, correctedOn: 'yesterday' }).success).toBe(false);
    expect(GameSnapshot.safeParse({ ...snap, periods: 3 }).success).toBe(false);
  });
});
