// Runs first in every test worker. A worker takes the computer's spare time and leaves the
// first claim to the main vitest process, which answers each worker's progress report. When
// workers and other runs crowd the machine, a main process that cannot get a turn leaves a
// report unanswered for a minute and vitest fails the run ("Timeout calling onTaskUpdate")
// although every test passed. Lowering the workers' priority keeps the reports flowing.
import { constants, setPriority } from 'node:os';

try {
  setPriority(0, constants.priority.PRIORITY_BELOW_NORMAL);
} catch {
  // A computer that refuses to change priority just runs the tests as before.
}
