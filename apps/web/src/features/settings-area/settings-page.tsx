// Admin → League settings (step 2.48, P4 §6, T5 §6): a form for every setting the
// product declares at the league level, drawn from the declarations (T-98).
import { listLeagueSettings } from '@srleagues/core';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t, type TextKey } from '../../server/messages.ts';
import { doneKey, problemKey } from './answer.ts';
import { SettingForms, type Say } from './setting-fields.tsx';

export type SearchProps = {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
};

const say: Say = (key, params) => t(key as TextKey, params);

export async function SettingsPage({
  league,
  query,
}: {
  /** The route's `[league]` value. */
  readonly league: string;
  readonly query: Readonly<Record<string, string | string[] | undefined>>;
}) {
  const view = await loadLeaguePage(league, 'admin', 'settings');
  const { adminSettings } = await webPorts();
  const rows = await adminSettings.deps.transaction(commandContextOf(view.context), (tx) =>
    listLeagueSettings(tx),
  );
  const problem = problemKey(query);
  const good = doneKey(query);
  return (
    <main>
      <h1>{t('admin.area.settings')}</h1>
      {problem === undefined ? null : <p role="alert">{t(problem)}</p>}
      {problem === undefined && good !== undefined ? <p role="status">{t(good)}</p> : null}
      <p>{t('adminSettings.intro')}</p>
      {rows.length === 0 ? (
        <p>{t('adminSettings.none')}</p>
      ) : (
        <SettingForms rows={rows} league={view.context.league.slug} say={say} />
      )}
    </main>
  );
}
