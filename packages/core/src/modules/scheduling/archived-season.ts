// The scheduling module's half of "an archived season is read-only" (O-12, step 2.130,
// T-377): every change to a season's schedule draft, and publishing it, names this
// check, and the command framework refuses it with `season-archived`.
import type { SchedulingStore } from './ports.ts';

export async function seasonArchivedForSchedule(
  input: { readonly seasonId: string },
  tx: { readonly scheduling: Pick<SchedulingStore, 'seasonArchived'> },
): Promise<boolean> {
  return tx.scheduling.seasonArchived(input.seasonId);
}
