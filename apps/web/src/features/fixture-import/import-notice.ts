// The notice the fixture import screen shows after a step (step 2.155 part 6, T-434): what
// was done, or why it was refused, as a message key (T-187). It is the server's one-time
// notice (server/saved-notice.ts), left by the step's action for the person who sent it and
// taken once as the page is drawn, never the address: a reload or Back says nothing old, and
// a hand-typed address cannot make the page say a step was done or any number of clashes.
// An unknown code becomes the general "that did not work".
import type { SavedNotice } from '../../server/saved-notice.ts';
import type { TextKey } from '../../server/messages.ts';
import { isImportAction } from './run-import-action.ts';

export type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

export const first = (value: string | string[] | undefined): string | undefined =>
  typeof value === 'string' ? value : undefined;

const problemKeys: readonly TextKey[] = [
  'admin.import.error.not-allowed',
  'admin.import.error.invalid-input',
  'admin.import.error.no-file',
  // An archived season is read-only (O-12, step 2.130).
  'admin.import.error.season-archived',
  'admin.import.error.no-season',
  'admin.import.error.season-not-found',
  'admin.import.error.file-too-large',
  'admin.import.error.no-account',
  'admin.import.error.import-not-found',
  'admin.import.error.changed-since-read',
  'admin.import.error.not-ready',
  'admin.import.error.not-applied',
  'admin.import.error.not-reading',
  'admin.import.error.report-unreadable',
  'admin.import.error.record-unreadable',
  'admin.import.error.revision-out-of-date',
  'admin.import.error.draft-unreadable',
  'admin.import.error.draft-too-large',
  'admin.import.error.draft-changed',
  'admin.import.error.teams-changed',
  'admin.import.error.team-left',
  'admin.import.error.venues-changed',
  'admin.import.error.change-refused',
];

export type ImportNotice = {
  readonly key: TextKey;
  readonly problem: boolean;
  /** After apply: the clashes the added games cause, when there are any. */
  readonly clashes?: number;
};

/** The notice's `thing` when a step names no import (an upload refused before it made one). */
export const noImport = 'none';

/** What a step leaves as `said`: `done.<step>`, `done.apply.<clashes>`, or `problem.<code>`. */
export function importSaid(
  result:
    | { readonly ok: true; readonly clashCount?: number }
    | { readonly ok: false; readonly code: string },
  action: string,
): string {
  if (!result.ok) return `problem.${result.code}`;
  const clashes = result.clashCount ?? 0;
  return action === 'apply' && clashes > 0 ? `done.apply.${clashes}` : `done.${action}`;
}

/**
 * The notice the page took, read back for the import it shows (`noImport` for none);
 * undefined for no notice, one about another import, or one it did not leave.
 */
export function importNotice(
  notice: SavedNotice | undefined,
  shownImport: string | undefined,
): ImportNotice | undefined {
  if (notice === undefined || notice.screen !== 'import') return undefined;
  if (notice.thing !== (shownImport ?? noImport)) return undefined;
  const [kind, word, count, ...rest] = notice.said.split('.');
  if (rest.length > 0) return undefined;
  if (kind === 'done' && isImportAction(word)) {
    if (count === undefined) return { key: `admin.import.done.${word}`, problem: false };
    if (word !== 'apply' || !/^[1-9]\d{0,5}$/.test(count)) return undefined;
    return { key: 'admin.import.done.apply', problem: false, clashes: Number(count) };
  }
  if (kind !== 'problem' || word === undefined || count !== undefined) return undefined;
  const key = `admin.import.error.${word}`;
  return { key: problemKeys.find((k) => k === key) ?? 'admin.import.error.unknown', problem: true };
}
