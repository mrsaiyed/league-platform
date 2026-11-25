// Admin → League settings (step 2.48, P4 §6, T5 §6): a form for every setting the
// product declares at the league level, drawn from the declarations (T-98).
import {
  leagueUrl,
  listLeagueSettings,
  mayChangeLeagueSettings,
  mayEditLeague,
  readNamePolicy,
  readPrivacyFacts,
  readPublishChecks,
  readYouthResets,
} from '@srleagues/core';
import { EmptyPanel, PageHead } from '@srleagues/ui';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { locale, t, type TextKey } from '../../server/messages.ts';
import { takeNotice } from '../list-forms/index.ts';
import { doneKey, problemKey } from './answer.ts';
import { profileSaved } from './profile-form-answer.ts';
import { settingSaved } from './setting-form-answer.ts';
import { privacyNotes } from './privacy-notes.ts';
import { ProfilePanel } from './profile-panel.tsx';
import { archiveAsk, publishAsk, PublishPanel } from './publish-panel.tsx';
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
  const context = commandContextOf(view.context);
  const { rows, facts, policy, current, checks, mayPublish, profile, resets, mayEdit } =
    await adminSettings.deps.transaction(context, async (tx) => ({
      rows: await listLeagueSettings(tx),
      facts: await readPrivacyFacts(tx),
      policy: await readNamePolicy(tx.leagues),
      // The Publish part (step 2.240): the league's state and version, and the checks.
      current: await tx.leagues.currentLeague(),
      checks: await readPublishChecks(tx),
      mayPublish: await mayChangeLeagueSettings(context, tx),
      // League settings → Profile (step 2.125).
      profile: await tx.leagues.leagueProfile(),
      resets: await readYouthResets(tx),
      mayEdit: await mayEditLeague(context, tx),
    }));
  const { timeZone } = await publicSchedule.clockOf(view.context.league.id);
  const notes = privacyNotes({ facts, policy, rows, timeZone, locale });
  // A Profile form's or a setting's "Saved" (step 2.155 parts 3 and 4): taken once, so a
  // reload says nothing old.
  const notice = takeNotice(context, 'settings');
  const saved = profileSaved(notice?.said);
  const settingSaid = settingSaved(
    notice,
    (key) => rows.find((row) => row.key === key)?.label as TextKey | undefined,
  );
  const address = leagueUrl(view.context.league, 'admin-area', { area: 'settings' });
  const problem = problemKey(query);
  const good = doneKey(query);
  return (
    <main className="admin-settings">
      <PageHead title={t('admin.area.settings')} sub={t('adminSettings.intro')} />
      {/* Who helps run the league (step 2.97): its own page, one row that leads to it. */}
      <ul className="staff-rows settings-admins">
        <li className="staff-row">
          <span className="staff-row-words">
            <a
              className="staff-row-link"
              href={leagueUrl(view.context.league, 'admin-area', {
                area: 'settings',
                subpath: ['admins'],
              })}
            >
              {t('adminAccess.title')}
            </a>
            <span className="staff-row-facts">{t('adminAccess.fromSettings')}</span>
          </span>
        </li>
      </ul>
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
      {/* Profile (step 2.125) is the first thing in League settings (T-352); the page-step
          checks find each settings form by the setting it names, not by its place. */}
      {current === undefined || profile === undefined ? null : (
        <ProfilePanel
          league={view.context.league.slug}
          address={address}
          saved={saved}
          name={current.name}
          slug={current.slug}
          version={current.version}
          profile={profile}
          resets={resets}
          mayChange={mayEdit}
        />
      )}
      {current === undefined ? null : (
        <PublishPanel
          league={view.context.league.slug}
          address={address}
          status={current.status}
          version={current.version}
          checks={checks}
          mayPublish={mayPublish}
          asking={query[publishAsk.name] === publishAsk.value}
          askingArchive={query[archiveAsk.name] === archiveAsk.value}
        />
      )}
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
          <SettingForms
            rows={rows}
            league={view.context.league.slug}
            address={address}
            say={say}
            notes={notes}
            saved={settingSaid}
          />
        </>
      )}
    </main>
  );
}
