// The public snapshot's player key (T-462, T-463; step 2.225).
import { createHmac } from 'node:crypto';
import { GameSnapshotReading } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { playerKeyUnder, publicPlayerKey } from './player-key.ts';

const secret = 'made-up-session-secret-0123456789abcdef';
const gameA = '01900000-0000-7000-8000-0000000b0001';
const gameB = '01900000-0000-7000-8000-0000000b0002';
const player = '01900000-0000-7000-8000-00000000f001';
const other = '01900000-0000-7000-8000-00000000f002';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('the public player key', () => {
  const keyOf = playerKeyUnder(secret);

  it('is the same for one player all through one game, whatever the letter case', () => {
    expect(keyOf(gameA, player)).toBe(keyOf(gameA, player));
    expect(keyOf(gameA.toUpperCase(), player.toUpperCase())).toBe(keyOf(gameA, player));
  });

  it('is different for one player in two games, and for two players in one game', () => {
    expect(keyOf(gameA, player)).not.toBe(keyOf(gameB, player));
    expect(keyOf(gameA, player)).not.toBe(keyOf(gameA, other));
  });

  it('is a version 8 UUID that holds neither id, so a page opened before it still reads it', () => {
    const key = keyOf(gameA, player);
    expect(key).toMatch(uuid);
    for (const id of [gameA, gameB, player, other]) {
      expect(key).not.toBe(id);
      expect(key.slice(-12)).not.toBe(id.slice(-12));
    }
    const reading = GameSnapshotReading.shape.players.element.shape.playerId;
    expect(reading.safeParse(key).success).toBe(true);
  });

  it('cannot be made without the secret, nor by the same secret for another use', () => {
    expect(playerKeyUnder('another-made-up-secret-0123456789abcd')(gameA, player)).not.toBe(
      keyOf(gameA, player),
    );
    // The same secret over the two ids with no label gives none of the key's bytes.
    const unlabelled = createHmac('sha256', secret).update(`${gameA}\n${player}`).digest('hex');
    expect(unlabelled.slice(0, 8)).not.toBe(keyOf(gameA, player).slice(0, 8));
  });

  it('is one key for the server, the same when asked again', () => {
    expect(publicPlayerKey(gameA, player)).toMatch(uuid);
    expect(publicPlayerKey(gameA, player)).toBe(publicPlayerKey(gameA, player));
    expect(publicPlayerKey(gameA, player)).not.toBe(publicPlayerKey(gameB, player));
  });
});
