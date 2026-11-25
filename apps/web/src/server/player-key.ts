// A player's key in one game's public snapshot (T-462, T-463; step 2.225, finding D-M4):
// the one place it is made. No public answer carries a person's or a roster place's
// database id, so a viewer's page knows each player of a game by this key only: the
// same all through that game, different in every other game, and nobody who kept an
// old answer can work it back to the id or forward to another game.
//
// It is HMAC-SHA-256 of a fixed label, the game's id and the player's id, under the
// server's key secret, cut to 16 bytes. The label means the same secret can never give
// the same value for any other use. The 16 bytes are written as a
// UUID of version 8 (RFC 9562's version for a value made by our own rule, T-463), so a
// watcher's page opened before this step, whose contract reads `playerId` as a UUID,
// still takes the next answer whole.
//
// The key secret (T-465): every server process with the same settings must give the same
// key for a game, and no setting the founder must add by hand may be needed. So, in order:
// SESSION_SECRET when it is set; else, where the app runs on a real database, a secret
// derived (HKDF-SHA-256 under a label of its own) from the sign-in service's secret key,
// which the settings already require there (config-schema.ts) and which no visitor ever
// sees; else, only on made-up data with neither, a random secret made when the server
// starts (keys then change on a restart, which a page takes whole). Nothing public is ever
// the key's secret, and none of it is ever logged.
import { createHmac, hkdfSync, randomBytes } from 'node:crypto';
import type { PlayerKeyOf } from '@srleagues/core';
import type { Config } from './config-schema.ts';

const label = 'srleagues/public-snapshot/player-key/v1';
const derivationLabel = 'srleagues/public-snapshot/player-key-secret/v1';

/** The settings the key secret is chosen from (T-465). */
export type PlayerKeySettings = Pick<Config, 'SESSION_SECRET' | 'SUPABASE_SECRET_KEY'>;

/**
 * A secret of 32 bytes derived from a server-only secret under a label (HKDF-SHA-256): not
 * the secret itself, and another label gives another. Exported for its tests.
 */
export function derivedSecret(serverSecret: string, info: string = derivationLabel): Uint8Array {
  return new Uint8Array(hkdfSync('sha256', serverSecret, derivationLabel, info, 32));
}

/** The key's secret from the settings, in T-465's order. */
export function playerKeySecretFrom(settings: PlayerKeySettings): string | Uint8Array {
  if (settings.SESSION_SECRET !== undefined) return settings.SESSION_SECRET;
  if (settings.SUPABASE_SECRET_KEY !== undefined)
    return derivedSecret(settings.SUPABASE_SECRET_KEY);
  return randomBytes(32);
}

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
 * Sets the server's key, once, as the server starts (container.ts), before any snapshot is
 * read, under the secret T-465 chooses. It never fails for want of SESSION_SECRET. A second
 * start in one process (the tests start the app many times) sets it again from its settings.
 */
export function startPublicPlayerKey(settings: PlayerKeySettings): void {
  holder[slot] = playerKeyUnder(playerKeySecretFrom(settings));
}

/** The server's one player key (T-462). */
export const publicPlayerKey: PlayerKeyOf = (gameId, playerId) => {
  holder[slot] ??= playerKeyUnder(randomBytes(32));
  return holder[slot](gameId, playerId);
};
