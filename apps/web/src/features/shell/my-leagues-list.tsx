import {
  adminAreaPermissions,
  leagueUrl,
  rolePermissions,
  type LeagueMembership,
  type MyLeague,
} from '@srleagues/core';
import { EmptyPanel } from '@srleagues/ui';
import { t, type TextKey } from '../../server/messages.ts';

const membershipWords: Readonly<Record<LeagueMembership, TextKey>> = {
  owner: 'role.owner',
  admin: 'role.admin',
  registrar: 'role.registrar',
  scheduler: 'role.scheduler',
  editor: 'role.editor',
  scorekeeper: 'role.scorekeeper',
  club_admin: 'role.club_admin',
  coach: 'role.coach',
  captain: 'role.captain',
  'on-a-team': 'account.role.on-a-team',
};

/** What a person is in one league, in words: "Owner, Scheduler". */
export function membershipsInWords(memberships: readonly LeagueMembership[]): string {
  return memberships.map((m) => t(membershipWords[m])).join(', ');
}

/**
 * Whether one of these memberships opens an area of the admin (P4 §3–4): the owner always;
 * a role when it holds a permission of some area, as the admin's own gate asks
 * (openAdminAreas). Coaches, captains and players have no area: their tools are elsewhere.
 */
export function runsSomething(memberships: readonly LeagueMembership[]): boolean {
  return memberships.some(
    (m) =>
      m === 'owner' ||
      (m !== 'on-a-team' &&
        Object.values(adminAreaPermissions).some((needed) =>
          needed.some((permission) => rolePermissions[m].includes(permission)),
        )),
  );
}

/**
 * The leagues a signed-in person belongs to, each a link to its home with their role in it
 * (P2 lines 67 and 71): on the front page and the account page. Only leagues they may see
 * reach it (core's myLeagues, record 066). With none, it says what will appear here. Built
 * from the shared pieces (a grid of entries, each a button-sized link) until step 2.102.
 * Beside a league they help run, "Admin" opens its admin (step 2.194's walk: the league's
 * name opens its public home, and the admin was found only behind the menu).
 */
export function MyLeaguesList({ leagues }: { readonly leagues: readonly MyLeague[] }) {
  if (leagues.length === 0) return <EmptyPanel text={t('account.leaguesEmpty')} />;
  return (
    <ul className="ui-card-grid my-leagues">
      {leagues.map((league) => (
        <li key={league.leagueId}>
          <a className="ui-button" href={leagueUrl(league, 'home')} dir="auto">
            {league.name}
          </a>
          <span>{membershipsInWords(league.memberships)}</span>
          {runsSomething(league.memberships) ? (
            <a href={leagueUrl(league, 'admin')}>{t('account.leagueAdmin')}</a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
