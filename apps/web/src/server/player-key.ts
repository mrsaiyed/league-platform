// A player's key in one game's public snapshot (T-462, T-463; step 2.225, finding D-M4):
// the one place it is made. No public answer carries a person's or a roster place's
// database id, so a viewer's page knows each player of a game by this key only: the
// same all through that game, different in every other game, and nobody who kept an
// old answer can work it back to the id or forward to another game.
//
// It is HMAC-SHA-256 of a fixed label, the game's id and the player's id, under the
// server's session secret (SESSION_SECRET), cut to 16 bytes. The label means the same
// secret can never give the same value for any other use. The 16 bytes are written as a
// UUID of version 8 (RFC 9562's version for a value made by our own rule, T-463), so a
// watcher's page opened before this step, whose contract reads `playerId` as a UUID,
// still takes the next answer whole. Where no session secret is set (this computer, the
// tests) a random secret made when the server starts stands in: nothing public is ever
// the key's secret, and keys then change when the server restarts, which a page takes
// as a new answer (it adopts every snapshot whole).
import { createHmac, randomBytes } from 'node:crypto';
import type { PlayerKeyOf } from '@srleagues/core';

const label = 'srleagues/public-snapshot/player-key/v1';

/** The key under one secret: exported for its tests; the app uses `publicPlayerKey`. */
export function playerKeyUnder(secret: string | Uint8Array): PlayerKeyOf {
  return (gameId, playerId) => {
    const bytes = createHmac('sha256', secret)
      .update(`${label}\n${gameId.toLowerCase()}\n${playerId.toLowerCase()}`)
      .digest()
      .subarray(0, 16);
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32),
    ].join('-');
  };
}

// Kept on globalThis, as the container's ports are: Next.js may load this file more than
// once in one process, and every copy must give the same key.
const slot = Symbol.for('srleagues.public-player-key');
type Holder = { [slot]?: PlayerKeyOf };
const holder = globalThis as Holder;

/**
 * Sets the server's key under its session secret, once, as the server starts (container.ts),
 * before any snapshot is read. Without one a random secret stands in.
 */
export function startPublicPlayerKey(sessionSecret: string | undefined): void {
  if (holder[slot] !== undefined) throw new Error('The public player key was made before start.');
  holder[slot] = playerKeyUnder(sessionSecret ?? randomBytes(32));
}

/** The server's one player key (T-462). */
export const publicPlayerKey: PlayerKeyOf = (gameId, playerId) => {
  holder[slot] ??= playerKeyUnder(randomBytes(32));
  return holder[slot](gameId, playerId);
};
