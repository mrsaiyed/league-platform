import { leagueUrl, type LeagueMembership, type MyLeague } from '@srleagues/core';
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
 * The leagues a signed-in person belongs to, each a link to its home with their role in it
 * (P2 lines 67 and 71): on the front page and the account page. Only leagues they may see
 * reach it (core's myLeagues, record 066). With none, it says what will appear here. Built
 * from the shared pieces (a grid of entries, each a button-sized link) until step 2.102.
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
        </li>
      ))}
    </ul>
  );
}
