// "Confirm and start scoring" (step 2.119, T-344): with signal the device reads the game's
// format again first and does not start on one that is no longer the game's; with no
// signal it starts on what it has.
import {
  formatFacts,
  formatOfRules,
  gameFormatPresets,
  seasonRulesPreset,
  type GameFormatRules,
  type GameFormatView,
} from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { checkBeforeStart, sameData } from './check-before-start.ts';
import type { FormatOutcome, GameFormatClient } from './format-client.ts';

const rules = seasonRulesPreset('rec-league');
const halves = formatOfRules(rules);
const quarters: GameFormatRules = {
  ...halves,
  gameFormat: { ...halves.gameFormat, periods: 4, periodSeconds: 480 },
};
const viewOf = (applies: GameFormatRules): GameFormatView => ({
  version: 3,
  given: applies === halves ? null : applies,
  season: halves,
  applies,
  source: applies === halves ? 'season' : 'given',
  facts: formatFacts(applies),
  change: { may: true, as: 'scorekeeper' },
  presets: gameFormatPresets(rules),
});
const clientOf = (outcome: FormatOutcome): GameFormatClient & { reads: number } => {
  const client = {
    reads: 0,
    read: async () => {
      client.reads += 1;
      return outcome;
    },
    change: async () => ({ kind: 'failed' }) as const,
  };
  return client;
};
const always = () => true;

describe('checking the format before the game starts (T-344)', () => {
  it('starts when the game still has the format shown', async () => {
    const client = clientOf({ kind: 'format', view: viewOf(halves) });
    expect(await checkBeforeStart(client, halves, always)).toEqual({ kind: 'start' });
    expect(client.reads).toBe(1);
  });

  it('does not start when the format was changed since it was shown: it hands back the new one', async () => {
    const client = clientOf({ kind: 'format', view: viewOf(quarters) });
    expect(await checkBeforeStart(client, halves, always)).toEqual({
      kind: 'changed',
      view: viewOf(quarters),
    });
  });

  it('does not start when the device plays other rules than the game has, even if shown the same', async () => {
    const client = clientOf({ kind: 'format', view: viewOf(quarters) });
    const playsHalves = (f: GameFormatRules) => f.gameFormat.periods === 2;
    expect((await checkBeforeStart(client, quarters, playsHalves)).kind).toBe('changed');
    expect((await checkBeforeStart(client, null, playsHalves)).kind).toBe('changed');
  });

  it('starts on what it has with no signal, or when the read is not answered with a format', async () => {
    expect(await checkBeforeStart(clientOf({ kind: 'failed' }), halves, always)).toEqual({
      kind: 'start',
    });
    const refused = clientOf({ kind: 'refused', code: 'not-allowed' });
    expect(await checkBeforeStart(refused, null, always)).toEqual({ kind: 'start' });
  });

  it('compares formats by their values, not their key order', () => {
    const { timeouts, fouls, clock, gameFormat, version } = halves;
    const reordered = { timeouts, fouls, clock, gameFormat, version };
    expect(sameData(halves, { ...halves })).toBe(true);
    expect(sameData(halves, reordered)).toBe(true);
    expect(sameData(halves, quarters)).toBe(false);
    expect(sameData({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameData([1, 2], [2, 1])).toBe(false);
  });
});
