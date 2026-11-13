import { describe, expect, it } from 'vitest';
import { CommandBatch } from '../index.ts';

// The scorer commands of live-stats.ts, read as they arrive inside a batch.
const id = (n: number) => `0192f000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const batch = (input: object) => ({
  protocolVersion: 1,
  sessionId: id(99),
  commands: [{ commandId: id(1), at: 1_700_000_000_000, input }],
});
const parses = (input: object) => CommandBatch.safeParse(batch(input)).success;

const rules = {
  periods: 2,
  periodSeconds: 1200,
  overtimeSeconds: 300,
  bonusFouls: 7,
  doubleBonusFouls: 10,
};

describe('clock mode (T-128)', () => {
  it('takes the switch to a running or a stop clock, and nothing else', () => {
    expect(parses({ type: 'clock-mode', mode: 'running' })).toBe(true);
    expect(parses({ type: 'clock-mode', mode: 'stop' })).toBe(true);
    expect(parses({ type: 'clock-mode', mode: 'fast' })).toBe(false);
    expect(parses({ type: 'clock-mode' })).toBe(false);
    expect(parses({ type: 'clock-mode', mode: 'stop', side: 'home' })).toBe(false);
  });

  it('takes rules with or without a clock mode', () => {
    expect(parses({ type: 'rules', rules })).toBe(true);
    expect(parses({ type: 'rules', rules: { ...rules, clockMode: 'running' } })).toBe(true);
    expect(parses({ type: 'rules', rules: { ...rules, clockMode: 'often' } })).toBe(false);
  });
});
