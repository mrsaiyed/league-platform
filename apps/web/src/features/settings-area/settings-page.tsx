// Admin → League settings (step 2.48, P4 §6, T5 §6): a form for every setting the
// product declares at the league level, drawn from the declarations (T-98).
import { listLeagueSettings, readNamePolicy, readPrivacyFacts } from '@srleagues/core';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { locale, t, type TextKey } from '../../server/messages.ts';
import { doneKey, problemKey } from './answer.ts';
import { privacyNotes } from './privacy-notes.ts';
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
  const { adminSettings, publicSchedule } = await webPorts();
  const { rows, facts, policy } = await adminSettings.deps.transaction(
    commandContextOf(view.context),
    async (tx) => ({
      rows: await listLeagueSettings(tx),
      facts: await readPrivacyFacts(tx),
      policy: await readNamePolicy(tx.leagues),
    }),
  );
  const { timeZone } = await publicSchedule.clockOf(view.context.league.id);
  const notes = privacyNotes({ facts, policy, rows, timeZone, locale });
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
        <SettingForms rows={rows} league={view.context.league.slug} say={say} notes={notes} />
      )}
    </main>
  );
}
