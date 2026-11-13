// T-121: the game clock on a viewer's device. A message gives a reference, "running,
// this much left as of this server instant", and the device counts down from it. The
// device's own clock is only used to measure how long ago the message came, so two
// devices with different clocks show the same time.
import type { ClockReference } from '@srleagues/contracts';

/**
 * How far this device's clock is from the server's: server time minus device time,
 * measured when a message or snapshot arrives. Add it to the device's time to get
 * server time.
 */
export function serverOffsetMs(serverSentAt: number, deviceReceivedAt: number): number {
  return serverSentAt - deviceReceivedAt;
}

/** Milliseconds left on the clock at `serverNowMs`. Never below zero, never above the reference. */
export function clockRemainingMs(clock: ClockReference, serverNowMs: number): number {
  if (clock.state === 'stopped') return clock.remainingMs;
  const ran = Math.max(0, serverNowMs - clock.asOf);
  return Math.max(0, clock.remainingMs - ran);
}

/** True while the clock is counting down (a running clock that reached zero has stopped). */
export function clockIsRunning(clock: ClockReference, serverNowMs: number): boolean {
  return clock.state === 'running' && clockRemainingMs(clock, serverNowMs) > 0;
}

/** "7:42". Whole seconds are rounded up, so the clock reads 0:00 only when time is out. */
export function formatClock(remainingMs: number): string {
  const seconds = Math.ceil(Math.max(0, Number(remainingMs) || 0) / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
