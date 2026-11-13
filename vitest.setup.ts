// Runs first in every test worker. vitest's main process answers each worker's progress
// report; the config gives it a little extra priority (vitest.config.ts) so that, when
// workers and other runs crowd the computer, a report is never left unanswered for a
// minute ("Timeout calling onTaskUpdate", a failed run although every test passed).
// Workers start from the main process's priority, so they go back to normal here.
import { constants, setPriority } from 'node:os';

try {
  setPriority(0, constants.priority.PRIORITY_NORMAL);
} catch {
  // A computer that refuses to change priority just runs the tests as before.
}
