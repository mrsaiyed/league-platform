// The server's own clock, as the apps pass it to the scoring session commands. Tests
// pass a clock they move by hand instead.
import type { Clock } from './ports.ts';

export const systemClock: Clock = { now: () => Date.now() };
