import type { LiveMessage } from '@srleagues/contracts';
import { defaultNamePolicy, type GameSnapshotStore } from '@srleagues/core';
import { LivePublishError, type LivePublisher } from '@srleagues/providers';
import { describe, expect, it } from 'vitest';
import { createPlayPublisher } from './publish-plays.ts';

const leagueId = '01900000-0000-7000-8000-00000000000a';
const gameA = '01900000-0000-7000-8000-0000000b0001';
const gameB = '01900000-0000-7000-8000-0000000b0002';
const home = '01900000-0000-7000-8000-0000000a0001';
const away = '01900000-0000-7000-8000-0000000a0002';

/** Games whose saved sequence the test moves by hand; no plays, so no names at all. */
function world(publisher: LivePublisher) {
  const seq = new Map<string, number>([
    [gameA, 0],
    [gameB, 0],
  ]);
  const store: GameSnapshotStore = {
    findGame: async (id) =>
      seq.has(id)
        ? {
            id,
            seasonId: 's',
            homeTeamId: home,
            awayTeamId: away,
            startsAt: null,
            status: 'live',
            captureMode: 'live',
            homeScore: seq.get(id) ?? 0,
            awayScore: 0,
            finalizedAt: null,
            binned: false,
          }
        : undefined,
    teams: async () => [
      { id: home, name: 'Home', slug: 'h', color: null, statsVisibility: 'everyone' },
      { id: away, name: 'Away', slug: 'a', color: null, statsVisibility: 'everyone' },
    ],
    state: async () => undefined,
    savedState: async (id) => ({ seq: seq.get(id) ?? 0, state: undefined }),
    lines: async () => [],
    people: async () => [],
    correctedOn: async () => undefined,
  };
  const warnings: string[] = [];
  const publish = createPlayPublisher({
    publisher,
    snapshotStoreOf: () => store,
    namesShownOf: async () => ({ audience: 'adult', policy: defaultNamePolicy }),
    clock: { now: () => 1_800_000_000_000 },
    warn: (_message, fields) => void warnings.push(fields.reason),
  });
  return { seq, publish, warnings };
}

function recorder() {
  const sent: { channel: 'game' | 'score'; gameId: string; sequence: number }[] = [];
  const holds = new Map<string, Promise<void>>();
  const publisher: LivePublisher = {
    publishGame: async (_leagueId, message: LiveMessage) => {
      await holds.get(message.gameId);
      sent.push({ channel: 'game', gameId: message.gameId, sequence: message.sequence });
    },
    publishLeagueScore: async (_leagueId, message) =>
      void sent.push({ channel: 'score', gameId: message.gameId, sequence: message.sequence }),
  };
  /** Holds a game's messages back until `p` settles. */
  const hold = (gameId: string, p: Promise<void>) => void holds.set(gameId, p);
  return { sent, publisher, hold };
}

describe('createPlayPublisher', () => {
  it('sends the game message, then its score on the league channel', async () => {
    const r = recorder();
    const w = world(r.publisher);
    w.seq.set(gameA, 1);
    await w.publish(leagueId, gameA);
    expect(r.sent).toEqual([
      { channel: 'game', gameId: gameA, sequence: 1 },
      { channel: 'score', gameId: gameA, sequence: 1 },
    ]);
  });

  it('sends one game in order and never the same newest state twice', async () => {
    const r = recorder();
    const w = world(r.publisher);
    let release = () => {};
    r.hold(gameA, new Promise<void>((resolve) => (release = resolve)));
    w.seq.set(gameA, 1);
    const first = w.publish(leagueId, gameA);
    // Two more batches saved while the first message is still going out.
    w.seq.set(gameA, 3);
    const second = w.publish(leagueId, gameA);
    const third = w.publish(leagueId, gameA);
    release();
    await Promise.all([first, second, third]);
    const game = r.sent.filter((s) => s.channel === 'game').map((s) => s.sequence);
    expect(game[0]).toBeLessThanOrEqual(game[1] ?? Infinity);
    expect(game).toEqual([...new Set(game)]);
    expect(game.at(-1)).toBe(3);
  });

  it('does not hold one game up for another', async () => {
    const r = recorder();
    const w = world(r.publisher);
    let release = () => {};
    w.seq.set(gameA, 1);
    w.seq.set(gameB, 1);
    r.hold(gameA, new Promise<void>((resolve) => (release = resolve)));
    const a = w.publish(leagueId, gameA);
    await w.publish(leagueId, gameB);
    expect(r.sent.map((s) => s.gameId)).toEqual([gameB, gameB]);
    release();
    await a;
    expect(r.sent.filter((s) => s.gameId === gameA)).toHaveLength(2);
  });

  it('reports a message that did not go out, and carries on with the next', async () => {
    let fail = true;
    const sent: number[] = [];
    const publisher: LivePublisher = {
      publishGame: async (_leagueId, message) => {
        if (fail) throw new LivePublishError('unavailable', true, 503);
        sent.push(message.sequence);
      },
      publishLeagueScore: async () => {},
    };
    const w = world(publisher);
    w.seq.set(gameA, 1);
    await expect(w.publish(leagueId, gameA)).resolves.toBeUndefined();
    expect(w.warnings).toEqual(['unavailable']);
    fail = false;
    w.seq.set(gameA, 2);
    await w.publish(leagueId, gameA);
    expect(sent).toEqual([2]);
  });

  it('sends nothing for a game that is not there', async () => {
    const r = recorder();
    const w = world(r.publisher);
    await w.publish(leagueId, '01900000-0000-7000-8000-0000000b0009');
    expect(r.sent).toEqual([]);
    expect(w.warnings).toEqual([]);
  });
});
