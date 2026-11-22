import { leagueUrl } from '@srleagues/core';
import { MessagePage, PageHead } from '@srleagues/ui';
import { redirect } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import { seasonsOfLeague } from '../../server/league-seasons.ts';
import { loadLeaguePage, requestPath } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import { signInFirstUrl } from '../../server/sign-in-first.ts';
import { chooseSeason } from '../stats-pages/index.ts';
import { loadTeamCards } from './build-team.ts';
import { myTeamsOf, myTeamWay } from './my-teams.ts';
import { TeamCards } from './teams-page.tsx';

/**
 * `/{league}/my` (P2 §4, step 2.168): where "My team" in the account menu leads. A member
 * with one team of the season is taken to its page; a member with several is shown them, to
 * open the one they want; a member with none is told so in a sentence, with the way to the
 * teams. Someone not signed in is sent to sign in and brought back here (U-15), and so goes
 * on to their team. The league gate runs first (U-9): a league hidden from them is "not
 * found". The person and their teams come from the server's session, never the request.
 * Their coach's or captain's tools come with stage 4, on their team's page (P4 §4).
 */
export async function MyPage({ league }: { readonly league: string }) {
  const view = await loadLeaguePage(league, 'site');
  const account = view.context.account;
  if (account === null) return redirect(signInFirstUrl(await requestPath()));
  const addressee = view.context.league;
  const ports = await webPorts();
  const { teams } = await myTeamsOf(ports, {
    leagueId: addressee.id,
    accountId: account.accountId,
    holder: () => ports.accessOf(commandContextOf(view.context)),
  });
  const way = myTeamWay(teams);
  if (way.kind === 'team') return redirect(leagueUrl(addressee, 'team', { team: way.slug }));
  const season = chooseSeason(await seasonsOfLeague(addressee.id), undefined);
  const cards =
    way.kind === 'none' || season === undefined
      ? undefined
      : await loadTeamCards(ports.publicStats.readStoreOf(addressee.id), addressee, season, true);
  const mine = new Set(teams.map((team) => team.slug));
  const own = cards?.filter((card) => mine.has(card.slug)) ?? [];
  if (own.length === 0) {
    return (
      <MessagePage
        title={t('nav.my')}
        action={{ href: leagueUrl(addressee, 'teams'), label: t('team.my.seeTeams') }}
      >
        <p>{t('team.my.none')}</p>
      </MessagePage>
    );
  }
  return (
    <main>
      <PageHead title={t('team.my.several')} kicker={season?.name} sub={t('team.my.severalLead')} />
      <TeamCards cards={own} />
    </main>
  );
}
