// Who gave the parents' confirmation (step 2.146): read from the activity log, never kept
// beside the setting. The entry is the save of that setting, marked as a confirmation, made
// nearest the moment the stored value was last saved; none found is "not known", and the
// screen then says the day only.
import type { ActivityRecord } from '@srleagues/core';

/** How far either side of the saved moment an entry is looked for, in milliseconds. */
export const confirmedByWindow = 60_000;

/** The span of the log to search: around the moment the confirmation was saved. */
export function confirmedBySpan(savedAt: string): { from: string; until: string } {
  const at = Date.parse(savedAt);
  return {
    from: new Date(at - confirmedByWindow).toISOString(),
    until: new Date(at + confirmedByWindow).toISOString(),
  };
}

/** The account that gave the confirmation saved at `savedAt`, or undefined when not known. */
export function confirmedBy(
  entries: readonly ActivityRecord[],
  key: string,
  savedAt: string,
): string | undefined {
  const at = Date.parse(savedAt);
  const distance = (entry: ActivityRecord) => Math.abs(Date.parse(entry.at) - at);
  const found = entries
    .filter(
      (entry) =>
        entry.action === 'leagues.set_setting' &&
        entry.details['key'] === key &&
        entry.details['confirmed'] === true &&
        distance(entry) <= confirmedByWindow,
    )
    .sort((a, b) => distance(a) - distance(b))[0];
  return found?.actorAccountId ?? undefined;
}
