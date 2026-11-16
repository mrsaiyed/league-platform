// The frame of every page of the admin (step 2.103; docs/build/DESIGN.md section 4, lines 20
// to 23, and the first demo's staff workspace): a calm, light workspace under any league's
// colors, with the admin's own menu in a dark shade of the league's main color.
//
// - On a phone, one row stays on top: the league's mark, the word "Admin" and the name of
//   the area the page is in, and one menu button, which opens the admin's own menu as a
//   panel. A plain disclosure, so it works with scripts switched off.
// - On a laptop, the menu is at the side: the league's mark and name, the areas with their
//   icons and the current one filled, and, apart at the foot, "View the site", who is
//   signed in, their account and "Sign out".
// - The public site's header and tabs are not drawn at all here (the league's layout
//   leaves them off an address of the admin). The foot is the product's small one: Terms,
//   Privacy and "Powered by SR Leagues" (U-8), never the league's public footer.
// - A league that is not public says so as a small pill in the header, which opens the
//   whole sentence; never a band across every page.
//
// The menu is in the page twice, as the public header's is: once in the phone's panel and
// once at the side. Only one of the two is ever drawn, whatever the width, so the keyboard
// and a screen reader meet it once.
import { leagueUrl, type LeagueStatus } from '@srleagues/core';
import { staffCssText, type DesignDocument } from '@srleagues/site';
import { Emblem } from '@srleagues/ui';
import type { ReactNode } from 'react';
import { webPorts } from '../../server/container.ts';
import type { LeagueView } from '../../server/league-gate.ts';
import { leagueSites, siteOf } from '../../server/league-site.ts';
import { requestPath, signedInEmail } from '../../server/load-league-page.ts';
import { t, type TextKey } from '../../server/messages.ts';
import { accountMenuOf, displayStylesheet, SiteFooter } from '../shell/index.ts';
import { CloseWhenLeft } from './close-when-left.tsx';
import { staffPlaceAt } from './staff-area.ts';
import { StaffFoot, StaffNav } from './staff-nav.tsx';

/**
 * The staff area's design as CSS variables, once per page (T-90): the league's design
 * turned into the workspace's (packages/site, staff-design.ts), and the shared display
 * pieces' stylesheet beside it, as on a public page.
 */
function StaffStyle({ design }: { readonly design: DesignDocument }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: staffCssText(design) }} />
      <link rel="stylesheet" href={displayStylesheet} precedence="pieces" />
    </>
  );
}

const statuses: Readonly<
  Record<LeagueStatus, { readonly pill: TextKey; readonly says: TextKey } | null>
> = {
  draft: { pill: 'admin.status.draft', says: 'shell.draftNotice' },
  live: null,
  archived: { pill: 'admin.status.archived', says: 'shell.archivedNotice' },
  suspended: { pill: 'admin.status.suspended', says: 'shell.suspendedNotice' },
};

/** A league that is not public, as a pill that opens the whole sentence (U-9). */
function StaffStatus({ status }: { readonly status: LeagueStatus }) {
  const found = statuses[status];
  return found === null ? null : (
    <details className="staff-status" data-status={status}>
      <summary>
        <span className="staff-pill" data-kind={status === 'suspended' ? 'stop' : 'wait'}>
          {t(found.pill)}
        </span>
      </summary>
      <p className="staff-status-says">{t(found.says)}</p>
    </details>
  );
}

export async function StaffFrame({
  view,
  children,
}: {
  /** The admin as it is open to this person. */
  readonly view: LeagueView;
  readonly children: ReactNode;
}) {
  const league = view.context.league;
  const site = await siteOf(league, await leagueSites());
  const path = await requestPath();
  const place = staffPlaceAt(league, path, view.areas);
  const account = accountMenuOf(view, await signedInEmail(), path);
  const home = leagueUrl(league, 'admin');
  const notPublic = statuses[league.status];
  const menu = (
    <>
      <StaffNav league={league} areas={view.areas} current={place} />
      <StaffFoot league={league} account={account} />
    </>
  );
  return (
    <div className="staff ui-root">
      <StaffStyle design={site.design} />
      <a className="staff-skip" href="#content">
        {t('shell.skipToContent')}
      </a>
      <header className="staff-bar">
        <a className="staff-bar-brand" href={home}>
          <Emblem name={site.name} kind="league" />
          <span className="staff-bar-words">
            <span className="staff-bar-label">{t('admin.title')}</span>
            {place === null ? null : (
              <span className="staff-bar-place">
                {t(place === 'home' ? 'admin.area.home' : `admin.area.${place}`)}
              </span>
            )}
          </span>
        </a>
        <StaffStatus status={league.status} />
        <details className="staff-menu">
          <summary>
            <span className="staff-menu-icon" aria-hidden="true" />
            <span className="ui-visually-hidden">{t('nav.menu')}</span>
          </summary>
          <div className="staff-menu-panel">{menu}</div>
          <CloseWhenLeft />
        </details>
      </header>
      {/* On a phone the pill's sentence, opened, is a strip in the page's flow under the
          row, so it covers none of the page; a second copy for the eye (staff.css). */}
      {notPublic === null ? null : (
        <p className="staff-status-band" data-status={league.status} aria-hidden="true">
          {t(notPublic.says)}
        </p>
      )}
      {/* The side's dark ground runs the height of the page; what it holds stays on the
          screen while the page scrolls. */}
      <aside className="staff-side">
        <div className="staff-side-held">
          <a className="staff-side-brand" href={home}>
            <Emblem name={site.name} kind="league" />
            <span className="staff-side-words">
              <span className="staff-side-name" dir="auto">
                {site.name}
              </span>
              <span className="staff-side-label">{t('admin.title')}</span>
            </span>
          </a>
          <StaffStatus status={league.status} />
          {menu}
        </div>
      </aside>
      <div className="staff-main">
        <div className="staff-body" id="content">
          {children}
        </div>
        <SiteFooter madeUp={(await webPorts()).madeUpWorld} />
      </div>
    </div>
  );
}
