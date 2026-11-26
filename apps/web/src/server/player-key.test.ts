// The public snapshot's player key (T-462, T-463; step 2.225).
import { createHmac } from 'node:crypto';
import { GameSnapshotReading } from '@srleagues/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  derivedSecret,
  playerKeySecretFrom,
  playerKeyUnder,
  publicPlayerKey,
  startPublicPlayerKey,
  type PlayerKeySettings,
} from './player-key.ts';

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

// T-465: which secret the key is made under. Each "process" here is a fresh key made from
// the same settings, as two server processes would make it as they start.
describe("the public player key's secret", () => {
  const serviceKey = 'made-up-sign-in-service-secret-key-0123456789';
  const keyOf = playerKeyUnder(secret);
  const processKey = (settings: PlayerKeySettings) => playerKeyUnder(playerKeySecretFrom(settings));
  const slot = Symbol.for('srleagues.public-player-key');
  const holder = globalThis as { [slot]?: unknown };
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is SESSION_SECRET when it is set: two processes give the same key', () => {
    const settings = { SESSION_SECRET: secret, SUPABASE_SECRET_KEY: serviceKey };
    expect(processKey(settings)(gameA, player)).toBe(processKey(settings)(gameA, player));
    expect(processKey(settings)(gameA, player)).toBe(keyOf(gameA, player));
  });

  it('is derived from the sign-in service key on a real database: two processes agree', () => {
    const settings = { SUPABASE_SECRET_KEY: serviceKey };
    expect(processKey(settings)(gameA, player)).toBe(processKey(settings)(gameA, player));
    expect(processKey(settings)(gameA, player)).not.toBe(keyOf(gameA, player));
    expect(processKey(settings)(gameA, player)).not.toBe(playerKeyUnder(serviceKey)(gameA, player));
  });

  it('is not the service key itself, and another label gives another secret', () => {
    const derived = Buffer.from(derivedSecret(serviceKey));
    expect(derived).toHaveLength(32);
    expect(derived.toString('hex')).not.toContain(Buffer.from(serviceKey).toString('hex'));
    expect(derived.toString('utf8')).not.toContain(serviceKey.slice(0, 8));
    expect(derived.equals(Buffer.from(derivedSecret(serviceKey)))).toBe(true);
    expect(derived.equals(Buffer.from(derivedSecret(serviceKey, 'another/label')))).toBe(false);
    expect(derived.equals(Buffer.from(derivedSecret(`${serviceKey}x`)))).toBe(false);
  });

  it('is random only with neither secret, and starting never fails for want of one', () => {
    expect(processKey({})(gameA, player)).not.toBe(processKey({})(gameA, player));
    const before = holder[slot];
    try {
      delete holder[slot];
      expect(() => startPublicPlayerKey({})).not.toThrow();
    } finally {
      holder[slot] = before;
    }
  });

  it('logs nothing of either secret as the server starts', () => {
    const written: string[] = [];
    const keep = (...parts: unknown[]) => {
      written.push(parts.map(String).join(' '));
      return true;
    };
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation(keep);
    }
    vi.spyOn(process.stdout, 'write').mockImplementation(keep);
    vi.spyOn(process.stderr, 'write').mockImplementation(keep);
    const before = holder[slot];
    try {
      delete holder[slot];
      startPublicPlayerKey({ SUPABASE_SECRET_KEY: serviceKey });
      expect(publicPlayerKey(gameA, player)).toBe(
        processKey({ SUPABASE_SECRET_KEY: serviceKey })(gameA, player),
      );
    } finally {
      holder[slot] = before;
    }
    const derived = Buffer.from(derivedSecret(serviceKey));
    for (const line of written) {
      expect(line).not.toContain(serviceKey);
      expect(line).not.toContain(derived.toString('hex'));
      expect(line).not.toContain(derived.toString('base64'));
    }
    expect(written).toEqual([]);
  });
});
