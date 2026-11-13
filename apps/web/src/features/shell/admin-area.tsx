import type { AdminArea as Area } from '@srleagues/core';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';

/** One area of the admin, empty for now; "you do not have access" without it (U-6). */
export async function AdminArea({
  league,
  area,
}: {
  /** The route's `[league]` value. */
  readonly league: string;
  readonly area: Area | null;
}) {
  await loadLeaguePage(league, 'admin', area);
  return (
    <main>
      <h1>{t(area === null ? 'admin.area.home' : `admin.area.${area}`)}</h1>
      <p>{t('admin.emptyArea')}</p>
    </main>
  );
}
