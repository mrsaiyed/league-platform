import { readGameCopy } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { copyFileName, gameCopyFile, suggestsCopy } from './game-copy-on-device.ts';
import type { QueuedCommand } from './queue-storage.ts';

const leagueId = '01900000-0000-7000-8000-0000000000a1';
const gameId = '01900000-0000-7000-8000-0000000000b2';
const otherGame = '01900000-0000-7000-8000-0000000000b3';
const me = '01900000-0000-7000-8000-0000000000e1';
const someoneElse = '01900000-0000-7000-8000-0000000000e2';
const id = (n: number) => `01900000-0000-7000-8000-00c0${n.toString(16).padStart(8, '0')}`;

const entry = (
  n: number,
  rest: Partial<Pick<QueuedCommand, 'gameId' | 'accountId' | 'protocolVersion'>> & {
    state?: 'waiting' | 'not-saved';
  } = {},
): QueuedCommand => ({
  gameId: rest.gameId ?? gameId,
  protocolVersion: rest.protocolVersion ?? 2,
  command: { commandId: id(n), at: 1000 * n, input: { type: 'start' } },
  sessionId: '01900000-0000-7000-8000-0000000000f1',
  leagueId,
  accountId: rest.accountId ?? me,
  ...(rest.state === 'not-saved' ? { state: 'not-saved', notSavedSince: 3 } : { state: 'waiting' }),
});

describe('"Save a copy" on the device (step 2.70)', () => {
  it('writes this account’s waiting taps of this game, in order, with their IDs and versions', () => {
    const file = gameCopyFile({
      leagueId,
      gameId,
      accountId: me,
      savedAt: Date.UTC(2026, 10, 24, 15, 7),
      entries: [
        entry(1, { protocolVersion: 1 }),
        entry(2, { accountId: someoneElse }),
        entry(3, { gameId: otherGame }),
        entry(4, { state: 'not-saved' }),
        entry(5),
      ],
    });
    expect(file.count).toBe(2);
    const read = readGameCopy(file.text, { leagueId, gameId });
    if (!read.ok) throw new Error(read.problem);
    expect(read.copy.commands.map((c) => [c.protocolVersion, c.command.commandId])).toEqual([
      [1, id(1)],
      [2, id(5)],
    ]);
    // The session, the account and the device are never written.
    expect(file.text).not.toContain(me);
    expect(file.text).not.toContain('sessionId');
  });

  it('still saves a copy when every play is on the server: it holds none', () => {
    const file = gameCopyFile({ leagueId, gameId, accountId: me, savedAt: 0, entries: [] });
    expect(file.count).toBe(0);
    expect(readGameCopy(file.text, { leagueId, gameId }).ok).toBe(true);
  });

  it('names the file by the game and the time, never a team or a person', () => {
    const at = new Date(2026, 10, 24, 9, 5).getTime();
    expect(copyFileName(gameId, at)).toBe('game-copy-000000b2-2026-11-24-0905.json');
  });

  it('suggests a copy only after several minutes offline with plays still waiting', () => {
    const queue = (waiting: number) => ({ waiting }) as Parameters<typeof suggestsCopy>[0]['queue'];
    expect(suggestsCopy({ offlineLong: true, queue: queue(3) })).toBe(true);
    expect(suggestsCopy({ offlineLong: true, queue: queue(0) })).toBe(false);
    expect(suggestsCopy({ offlineLong: false, queue: queue(3) })).toBe(false);
  });
});
