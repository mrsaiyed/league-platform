import type { LeagueStatus } from '@srleagues/core';
import { t, type TextKey } from '../../server/messages.ts';

const notices: Readonly<Record<LeagueStatus, TextKey | null>> = {
  draft: 'shell.draftNotice',
  live: null,
  archived: 'shell.archivedNotice',
  suspended: 'shell.suspendedNotice',
};

/** Says plainly when a league is not public, or is kept as it was (U-9). */
export function LeagueNotice({ status }: { readonly status: LeagueStatus }) {
  const notice = notices[status];
  return notice === null ? null : <p role="status">{t(notice)}</p>;
}
