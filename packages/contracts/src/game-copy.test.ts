import { describe, expect, it } from 'vitest';
import {
  gameCopyProblems,
  type GameCopyCommand,
  GameCopyUploadReply,
  maxCommandsPerCopy,
  readGameCopy,
  writeGameCopy,
} from './game-copy.ts';

const leagueId = '01900000-0000-7000-8000-0000000000a1';
const gameId = '01900000-0000-7000-8000-0000000000b2';
const here = { leagueId, gameId };
const id = (n: number) => `01900000-0000-7000-8000-00c0${n.toString(16).padStart(8, '0')}`;
const player = '01900000-0000-7000-8000-0000000000d4';

const commands: GameCopyCommand[] = [
  { protocolVersion: 2, command: { commandId: id(1), at: 1000, input: { type: 'start' } } },
  {
    protocolVersion: 2,
    command: {
      commandId: id(2),
      at: 2000,
      input: { type: 'add-player', side: 'away', playerId: player, jersey: '7', name: 'Ola' },
    },
  },
  {
    protocolVersion: 1,
    command: {
      commandId: id(3),
      at: 3000,
      input: { type: 'score', side: 'away', playerId: player, points: 2 },
    },
  },
];

const written = () => writeGameCopy({ leagueId, gameId, savedAt: 5000, commands });

describe('a copy of the game (T-129, step 2.70)', () => {
  it('reads back what it wrote: the commands with their IDs and versions, in order', () => {
    const read = readGameCopy(written(), here);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.copy).toEqual({
      format: 'game-copy',
      version: 1,
      leagueId,
      gameId,
      savedAt: 5000,
      commands,
    });
  });

  it('holds nothing but the league, the game, when, and the commands', () => {
    const data = JSON.parse(written()) as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual(
      ['commands', 'format', 'gameId', 'leagueId', 'savedAt', 'version'].sort(),
    );
    expect(written()).not.toMatch(/accountId|sessionId|deviceId|email/);
  });

  it('refuses a copy of another game or of another league', () => {
    expect(readGameCopy(written(), { leagueId, gameId: id(99) })).toEqual({
      ok: false,
      problem: 'other-game',
    });
    expect(readGameCopy(written(), { leagueId: id(98), gameId })).toEqual({
      ok: false,
      problem: 'other-league',
    });
  });

  it('refuses a damaged file: cut short, a changed command, a command ID twice', () => {
    const text = written();
    expect(readGameCopy(text.slice(0, text.length - 20), here)).toEqual({
      ok: false,
      problem: 'damaged',
    });
    const changed = JSON.parse(text) as { commands: { command: { input: unknown } }[] };
    const first = changed.commands[0];
    if (first === undefined) throw new Error('no command');
    first.command.input = { type: 'dunk' };
    expect(readGameCopy(JSON.stringify(changed), here)).toEqual({ ok: false, problem: 'damaged' });
    const twice = writeGameCopy({
      leagueId,
      gameId,
      savedAt: 1,
      commands: [commands[0], commands[0]].filter((c) => c !== undefined),
    });
    expect(readGameCopy(twice, here)).toEqual({ ok: false, problem: 'damaged' });
    const tooMany = JSON.parse(text) as { commands: unknown[] };
    tooMany.commands = Array.from({ length: maxCommandsPerCopy + 1 }, () => commands[0]);
    expect(readGameCopy(JSON.stringify(tooMany), here)).toEqual({ ok: false, problem: 'damaged' });
  });

  it('refuses an unknown version of the file, and a protocol version the server does not take', () => {
    const newer = { ...(JSON.parse(written()) as object), version: 2 };
    expect(readGameCopy(JSON.stringify(newer), here)).toEqual({
      ok: false,
      problem: 'unknown-version',
    });
    const first = commands[0];
    if (first === undefined) throw new Error('no command');
    const oldProtocol = writeGameCopy({
      leagueId,
      gameId,
      savedAt: 1,
      commands: [{ protocolVersion: 9, command: first.command }],
    });
    expect(readGameCopy(oldProtocol, here)).toEqual({ ok: false, problem: 'unknown-version' });
  });

  it('refuses any other file as not a copy', () => {
    for (const text of ['', 'hello', '[]', '{"games":[]}', '%PDF-1.4']) {
      expect(readGameCopy(text, here)).toEqual({ ok: false, problem: 'not-a-copy' });
    }
  });

  it('names every problem the reply may carry', () => {
    for (const code of gameCopyProblems) {
      expect(GameCopyUploadReply.parse({ status: 'refused', code })).toEqual({
        status: 'refused',
        code,
      });
    }
  });
});
