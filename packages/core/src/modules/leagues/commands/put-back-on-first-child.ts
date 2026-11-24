// S-109 (step 2.243): an adult league's "children in full" counts only if it was given
// while the league had children or a recorded child. Recording the league's FIRST child
// (a birth date or the tick on a new or changed person, a person back from the bin, a
// time zone that makes someone a child again) puts a confirmed yes back to no in the
// same transaction, as S-96 does when "who plays" brings children in: the same clearing
// (clearLeagueValueInside, logged as a clearing of its own), the same event, and League
// settings then asks for the privacy choices (privacy-notes.ts, publish-checks.ts read
// the recorded child). A league for children (under-18s or both) is never touched: its
// yes was given while it had children. A second child changes nothing.
//
// T-401: the save reads and writes through a narrow guard its own store gives (the
// people store, the bin store, the leagues store), so no transaction needs a store more.
import type { CommandContext, DomainEvent } from '../../../command/index.ts';
import type { ActivityTx } from '../../access/index.ts';
import { leagueSettingChanged } from '../events.ts';
import type { Audience } from '../league-values.ts';
import type { StoredSettingRow } from '../ports.ts';
import { childrenInFullConfirmed } from '../settings/declarations.ts';
import { clearGuardedValueInside } from './clear-setting.ts';

/** What the put-back reads and writes, for the league of the transaction. */
export type FirstChildGuard = {
  readonly leagueAudience: () => Promise<Audience>;
  /** Anyone not in the bin recorded as a child, by birth date or the tick (R-28). */
  readonly hasRecordedChild: () => Promise<boolean>;
  /** The league's own stored values of one setting (league level only). */
  readonly leagueSettingRows: (key: string) => Promise<readonly StoredSettingRow[]>;
  /** Clears the league's own value of one setting if it is still at `version`. */
  readonly clearLeagueSetting: (key: string, version: number) => Promise<boolean>;
};

/** The league's own saved "children in full" row when it says yes, else undefined. */
export function confirmedChildrenInFullRow(
  rows: readonly StoredSettingRow[],
): StoredSettingRow | undefined {
  return rows.find((row) => {
    if (row.level !== 'league') return false;
    const document = row.document;
    return typeof document === 'object' && document !== null && 'value' in document
      ? document.value === true
      : false;
  });
}

/**
 * Read BEFORE the save that may record a child: true when the save must be watched (an
 * adult league with no recorded child yet). Hand the answer to putBackOnFirstChild.
 */
export async function watchForFirstChild(guard: FirstChildGuard): Promise<boolean> {
  return (await guard.leagueAudience()) === 'adult' && !(await guard.hasRecordedChild());
}

/**
 * Read AFTER the save, in the same transaction: if it recorded the league's first child,
 * a confirmed "children in full" goes back to no. True when it was put back. Throws (the
 * whole save rolls back) if the yes is still there and could not be cleared.
 */
export async function putBackOnFirstChild(
  guard: FirstChildGuard,
  tx: ActivityTx,
  context: CommandContext,
  emit: <Event extends DomainEvent>(event: Event) => void,
  watching: boolean,
): Promise<boolean> {
  if (!watching || !(await guard.hasRecordedChild())) return false;
  const key = childrenInFullConfirmed.key;
  const saved = confirmedChildrenInFullRow(await guard.leagueSettingRows(key));
  if (saved === undefined) return false;
  const cleared = await clearGuardedValueInside(guard, tx, context, key, saved.version);
  if (!cleared) {
    // Another save cleared it first: nothing is left to put back.
    if (confirmedChildrenInFullRow(await guard.leagueSettingRows(key)) === undefined) return false;
    throw new Error('putBackOnFirstChild: the confirmation moved and is still yes.');
  }
  emit({ type: leagueSettingChanged, leagueId: context.leagueId, key });
  return true;
}
