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
import { childrenInFullConfirmed, publicNames } from '../settings/declarations.ts';
import { clearGuardedValueInside } from './clear-setting.ts';

/** What the put-back reads and writes, for the league of the transaction. */
export type FirstChildGuard = {
  /**
   * T-403: holds the league's own row until the transaction ends. A guarded save calls
   * it first, before it reads anything, so guarded saves of one league take turns.
   */
  readonly lockLeague: () => Promise<void>;
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

/** The league's own saved "Names on public pages" row when it says full names. */
function savedFullNamesRow(rows: readonly StoredSettingRow[]): StoredSettingRow | undefined {
  return rows.find((row) => {
    const document = row.document;
    return row.level === 'league' && typeof document === 'object' && document !== null
      ? 'value' in document && document.value === 'fullName'
      : false;
  });
}

/** Clears the league's row that `match` finds; false when there is none (or no longer). */
async function putBackRow(
  guard: FirstChildGuard,
  tx: ActivityTx,
  context: CommandContext,
  emit: <Event extends DomainEvent>(event: Event) => void,
  key: string,
  match: (rows: readonly StoredSettingRow[]) => StoredSettingRow | undefined,
): Promise<boolean> {
  const saved = match(await guard.leagueSettingRows(key));
  if (saved === undefined) return false;
  if (!(await clearGuardedValueInside(guard, tx, context, key, saved.version))) {
    // Another save cleared it first: nothing is left to put back.
    if (match(await guard.leagueSettingRows(key)) === undefined) return false;
    throw new Error(`putBackOnFirstChild: ${key} moved and is still saved.`);
  }
  emit({ type: leagueSettingChanged, leagueId: context.leagueId, key });
  return true;
}

/**
 * Read AFTER the save, in the same transaction: if it recorded the league's first child,
 * a confirmed "children in full" goes back to no, and a saved "full names" is cleared
 * (the start, full names, so adults look the same) so that League settings asks for the
 * privacy choices, as S-96 does. A saved initials or hidden shows less and is kept. True
 * when the yes was put back. Throws (the whole save rolls back) if a value to put back
 * is still there and could not be cleared.
 */
export async function putBackOnFirstChild(
  guard: FirstChildGuard,
  tx: ActivityTx,
  context: CommandContext,
  emit: <Event extends DomainEvent>(event: Event) => void,
  watching: boolean,
): Promise<boolean> {
  if (!watching || !(await guard.hasRecordedChild())) return false;
  const yes = await putBackRow(
    guard,
    tx,
    context,
    emit,
    childrenInFullConfirmed.key,
    confirmedChildrenInFullRow,
  );
  await putBackRow(guard, tx, context, emit, publicNames.key, savedFullNamesRow);
  return yes;
}
