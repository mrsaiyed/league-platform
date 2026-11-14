// The notice the fixture import screen shows after a step, read from its address: what was
// done, or why it was refused, as a message key (T-187). An unknown code becomes the
// general "that did not work", so nothing from the address is ever shown as it is.
import type { TextKey } from '../../server/messages.ts';
import { isImportAction } from './run-import-action.ts';

export type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

export const first = (value: string | string[] | undefined): string | undefined =>
  typeof value === 'string' ? value : undefined;

const problemKeys: readonly TextKey[] = [
  'admin.import.error.not-allowed',
  'admin.import.error.invalid-input',
  'admin.import.error.no-file',
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
  'admin.import.error.venues-changed',
  'admin.import.error.change-refused',
];

export type ImportNotice = {
  readonly key: TextKey;
  readonly problem: boolean;
  /** After apply: the clashes the added games cause, when there are any. */
  readonly clashes?: number;
};

export function importNotice(search: SearchParams): ImportNotice | undefined {
  const done = first(search['done']);
  if (isImportAction(done)) {
    const clashText = first(search['clashes']) ?? '';
    const clashes = /^\d{1,6}$/.test(clashText) ? Number(clashText) : 0;
    return {
      key: `admin.import.done.${done}`,
      problem: false,
      ...(done === 'apply' && clashes > 0 ? { clashes } : {}),
    };
  }
  const problem = first(search['problem']);
  if (problem === undefined) return undefined;
  const key = `admin.import.error.${problem}`;
  return { key: problemKeys.find((k) => k === key) ?? 'admin.import.error.unknown', problem: true };
}
