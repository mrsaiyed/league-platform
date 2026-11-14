// The nightly emptying of the bin (T-51): removes for good what has been in it for 30
// days, in one league. The worker runs it once per league, inside that league's fence
// (T-63), with the clock it was given, so a test can say what time it is. It acts for
// nobody (T-226), so it is a function the worker calls in its transaction, not a
// command. Running it twice does no harm (T-137): the second run finds nothing left.
import type { CommandContext } from '../../command/index.ts';
import { recordActivity } from '../access/index.ts';
import { binCutoff, type BinCounts, type BinTx } from './bin.ts';

/** The job type that does it (T7 §2). Its ids are empty: the league is the job's league. */
export const binEmptyJob = 'bin.empty';

export async function emptyBin(tx: BinTx, context: CommandContext, now: Date): Promise<BinCounts> {
  const counts = await tx.bin.purge(binCutoff(now));
  const total = counts.courts + counts.venues + counts.teams + counts.divisions + counts.people;
  if (total > 0) {
    await recordActivity(tx, context, { action: 'leagues.empty_bin', details: { ...counts } });
  }
  return counts;
}
