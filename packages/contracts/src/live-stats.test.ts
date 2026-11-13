import { describe, expect, it } from 'vitest';
import { Command, Envelope, PlatformCommand, PlatformEnvelope } from './live-stats.ts';

const rules = {
  periods: 2,
  periodSeconds: 1200,
  overtimeSeconds: 300,
  bonusFouls: 7,
  doubleBonusFouls: 10,
};
const id = '0192f000-0000-7000-8000-000000000001';

describe('clock mode (T-128)', () => {
  it('the platform shape takes the switch to a running or a stop clock, and nothing else', () => {
    const takes = (input: object) => PlatformCommand.safeParse(input).success;
    expect(takes({ type: 'clock-mode', mode: 'running' })).toBe(true);
    expect(takes({ type: 'clock-mode', mode: 'stop' })).toBe(true);
    expect(takes({ type: 'clock-mode', mode: 'fast' })).toBe(false);
    expect(takes({ type: 'clock-mode' })).toBe(false);
    expect(takes({ type: 'clock-mode', mode: 'stop', side: 'home' })).toBe(false);
    expect(takes({ type: 'rules', rules })).toBe(true);
    expect(takes({ type: 'rules', rules: { ...rules, clockMode: 'running' } })).toBe(true);
    expect(takes({ type: 'rules', rules: { ...rules, clockMode: 'often' } })).toBe(false);
    expect(takes({ type: 'foul', side: 'home', playerId: id })).toBe(true);
  });

  it('the Al-Hadi shape is unchanged: it refuses the switch and a clock mode in the rules', () => {
    expect(Command.safeParse({ type: 'clock-mode', mode: 'running' }).success).toBe(false);
    expect(Command.safeParse({ type: 'rules', rules }).success).toBe(true);
    expect(
      Command.safeParse({ type: 'rules', rules: { ...rules, clockMode: 'stop' } }).success,
    ).toBe(false);
    const envelope = { commandId: id, at: 5, input: { type: 'clock-mode', mode: 'stop' } };
    expect(Envelope.safeParse(envelope).success).toBe(false);
    expect(PlatformEnvelope.safeParse(envelope).success).toBe(true);
  });
});
