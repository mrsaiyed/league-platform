// The admin's own menu (P4 §3–4; step 2.103): home, then only the areas this person can use,
// each with its icon and the current one marked; and, apart at the foot, the way to the
// public site, who is signed in, their account and signing out. Drawn twice by the frame
// (the phone's panel and the laptop's side menu), only one of which is shown at any width.
import { leagueUrl, type AdminArea, type LeagueAddressee } from '@srleagues/core';
import { t } from '../../server/messages.ts';
import { signOutAction } from '../../server/sign-in/actions.ts';
import { SignOutFields, waitingQuestionWords, type AccountMenu } from '../shell/index.ts';
import { leagueHomeStayUrl } from '../team-pages/index.ts';
import { SignOutForm } from '../tracker/index.ts';
import { isReadyArea } from '../../server/releases.ts';
import type { StaffPlace } from './staff-area.ts';
import { StaffIcon } from './staff-icon.tsx';

/**
 * The areas of the admin open to this person that may be shown here (the frame leaves out
 * those not built yet in staging and production), the current one marked for everyone. An
 * area with no screen yet, drawn only in local work and tests, is marked "Not ready".
 */
export function StaffNav({
  league,
  areas,
  current,
}: {
  readonly league: LeagueAddressee;
  readonly areas: readonly AdminArea[];
  /** The part of the admin the page is in, if any. */
  readonly current: StaffPlace | null;
}) {
  const mark = (place: StaffPlace) => (place === current ? 'page' : undefined);
  return (
    <nav className="staff-nav" aria-label={t('admin.areasLabel')}>
      <ul>
        <li>
          <a href={leagueUrl(league, 'admin')} aria-current={mark('home')}>
            <StaffIcon name="home" />
            <span>{t('admin.area.home')}</span>
          </a>
        </li>
        {areas.map((area) => (
          <li key={area}>
            <a href={leagueUrl(league, 'admin-area', { area })} aria-current={mark(area)}>
              <StaffIcon name={area} />
              <span>{t(`admin.area.${area}`)}</span>
              {isReadyArea(area) ? null : (
                <span className="staff-nav-mark">{t('admin.notReady.mark')}</span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The foot of the menu, apart from the areas: "View the site", then the signed-in person
 * (their address, their account, signing out). Signing out also clears the games the
 * tracker kept on this device (T-115), as it does from the public header.
 */
export function StaffFoot({
  league,
  account,
}: {
  readonly league: LeagueAddressee;
  readonly account: AccountMenu | null;
}) {
  return (
    <div className="staff-foot">
      <a className="staff-foot-link" href={leagueHomeStayUrl(league)}>
        <StaffIcon name="site-out" />
        <span>{t('admin.viewSite')}</span>
      </a>
      {account === null ? null : (
        <>
          <a className="staff-foot-link" href={account.accountHref}>
            <span className="staff-avatar" aria-hidden="true">
              {account.initial}
            </span>
            <span className="staff-foot-words">
              <span>{t('account.menu.account')}</span>
              <span className="staff-who" data-staff-account="">
                {t('account.signedInAs', { email: account.email })}
              </span>
            </span>
          </a>
          <SignOutForm
            action={signOutAction}
            waitingQuestion={waitingQuestionWords()}
            accountId={account.accountId}
          >
            <SignOutFields fields={account.signOutFields} />
            <button className="staff-foot-link" type="submit">
              <StaffIcon name="sign-out" />
              <span>{t('account.signOut')}</span>
            </button>
          </SignOutForm>
        </>
      )}
    </div>
  );
}
