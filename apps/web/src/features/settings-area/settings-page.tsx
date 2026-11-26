// Admin → League settings (step 2.48, P4 §6, T5 §6): a form for every setting the
// product declares at the league level, drawn from the declarations (T-98).
import {
  leagueUrl,
  listAccess,
  mayChangeLeagueSettings,
  mayEditLeague,
  readLeagueSettings,
  readNamePolicy,
  type LeagueSettingsView,
} from '@srleagues/core';
import { EmptyPanel, PageHead } from '@srleagues/ui';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { locale, t, type TextKey } from '../../server/messages.ts';
import { IntoView, takeNotice } from '../list-forms/index.ts';
import { doneKey, problemKey, statusAnswerOf } from './answer.ts';
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
  const { adminAccess, adminSettings, publicSchedule } = await webPorts();
  const context = commandContextOf(view.context);
  // What the page draws is one read in core (step 2.227, T-474): it needs `league.settings`
  // for the whole league. An admin limited to one program is refused it and sees only the
  // head; nothing league-wide is read for them.
  const read = await readLeagueSettings(context, {}, adminSettings.deps);
  // The Admins row is drawn only for whoever the Admins page answers (step 2.97: the
  // league's whole list, `list_access` for the whole league), never as a dead link (S-131).
  const mayOpenAdmins = (await listAccess(context, {}, adminAccess.deps)).ok;
  const shown = read.ok
    ? await adminSettings.deps.transaction(context, async (tx) => ({
        ...read.value,
        policy: await readNamePolicy(tx.leagues),
        mayPublish: await mayChangeLeagueSettings(context, tx),
        mayEdit: await mayEditLeague(context, tx),
      }))
    : undefined;
  // The league's clock, for the privacy notes: read only when the settings read answered.
  const clock =
    shown === undefined ? undefined : await publicSchedule.clockOf(view.context.league.id);
  const rows: LeagueSettingsView['rows'] = shown?.rows ?? [];
  const notes =
    shown === undefined || clock === undefined
      ? undefined
      : privacyNotes({
          facts: shown.facts,
          policy: shown.policy,
          rows,
          timeZone: clock.timeZone,
          locale,
        });
  // A Profile form's or a setting's "Saved" (step 2.155 parts 3 and 4): taken once, so a
  // reload says nothing old.
  const notice = takeNotice(context, 'settings');
  const saved = profileSaved(notice?.said);
  const settingSaid = settingSaved(
    notice,
    (key) => rows.find((row) => row.key === key)?.label as TextKey | undefined,
  );
  const address = leagueUrl(view.context.league, 'admin-area', { area: 'settings' });
  // Publish, Archive and Un-archive (step 2.155 part 6): from the same notice, never the address.
  const answered = statusAnswerOf(notice);
  const problem = problemKey(answered);
  const good = doneKey(answered);
  return (
    <main className="admin-settings">
      <PageHead title={t('admin.area.settings')} sub={t('adminSettings.intro')} />
      {/* Who helps run the league (step 2.97): its own page, one row that leads to it,
          drawn only for whoever that page answers (S-131). */}
      {mayOpenAdmins ? (
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
      ) : null}
      {/* Said at the top as before; with scripts on the page is drawn again where it was,
          so the answer brings itself into view (T-437). */}
      {problem === undefined ? null : (
        <IntoView
          words={t(problem)}
          marks={{ className: 'ui-notice', 'data-kind': 'error', role: 'alert' }}
        >
          {t(problem)}
        </IntoView>
      )}
      {problem === undefined && good !== undefined ? (
        <IntoView
          words={t(good)}
          marks={{ className: 'ui-notice', 'data-kind': 'saved', role: 'status' }}
        >
          {t(good)}
        </IntoView>
      ) : null}
      {/* Profile (step 2.125) is the first thing in League settings (T-352); the page-step
          checks find each settings form by the setting it names, not by its place. */}
      {shown?.league === undefined || shown.profile === undefined ? null : (
        <ProfilePanel
          league={view.context.league.slug}
          address={address}
          saved={saved}
          name={shown.league.name}
          slug={shown.league.slug}
          version={shown.league.version}
          profile={shown.profile}
          resets={shown.resets}
          mayChange={shown.mayEdit}
        />
      )}
      {shown?.league === undefined ? null : (
        <PublishPanel
          league={view.context.league.slug}
          address={address}
          status={shown.league.status}
          version={shown.league.version}
          checks={shown.checks}
          mayPublish={shown.mayPublish}
          asking={query[publishAsk.name] === publishAsk.value}
          askingArchive={query[archiveAsk.name] === archiveAsk.value}
        />
      )}
      {shown === undefined || notes === undefined ? null : rows.length === 0 ? (
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
