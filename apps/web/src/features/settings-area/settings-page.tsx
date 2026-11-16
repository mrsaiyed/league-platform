// Admin → League settings (step 2.48, P4 §6, T5 §6): a form for every setting the
// product declares at the league level, drawn from the declarations (T-98).
import { listLeagueSettings, readNamePolicy, readPrivacyFacts } from '@srleagues/core';
import { EmptyPanel, PageHead } from '@srleagues/ui';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { locale, t, type TextKey } from '../../server/messages.ts';
import { doneKey, problemKey } from './answer.ts';
import { privacyNotes } from './privacy-notes.ts';
import { areaOf, SettingForms, type Say } from './setting-fields.tsx';

/** The groups the settings are shown under, in the order they are drawn, each once. */
const groupsOf = (rows: readonly { readonly key: string }[]): string[] => [
  ...new Set(rows.map((row) => areaOf(row.key))),
];

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
    <main className="admin-settings">
      <PageHead title={t('admin.area.settings')} sub={t('adminSettings.intro')} />
      {problem === undefined ? null : (
        <p className="ui-notice" data-kind="error" role="alert">
          {t(problem)}
        </p>
      )}
      {problem === undefined && good !== undefined ? (
        <p className="ui-notice" data-kind="saved" role="status">
          {t(good)}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <EmptyPanel text={t('adminSettings.none')} />
      ) : (
        <>
          {/* The groups, as a short row that reaches each one: the page is long. */}
          <nav className="settings-jump" aria-label={t('adminSettings.groups')}>
            <ul>
              {groupsOf(rows).map((area) => (
                <li key={area}>
                  <a href={`#settings-${area}`}>{say(`adminSettings.area.${area}`)}</a>
                </li>
              ))}
            </ul>
          </nav>
          <SettingForms rows={rows} league={view.context.league.slug} say={say} notes={notes} />
        </>
      )}
    </main>
  );
}
