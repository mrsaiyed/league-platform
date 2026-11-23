import { platformUrl } from '@srleagues/core';
import { redirect } from 'next/navigation';
import { MyLeaguesList, StandalonePage, TestCopyLine } from '../../features/shell/index.ts';
import type { SearchProps } from '../../features/sign-in/index.ts';
import { webPorts } from '../../server/container.ts';
import { t, type TextKey } from '../../server/messages.ts';
import { noticeOf, notices, screenUrl } from '../../server/sign-in/problems.ts';
import { leaguesOfThisRequest, signedInPerson } from '../../server/signed-in-leagues.ts';

// Our front page (P2 line 67), as far as step 2.127 builds it: a signed-in person sees
// the leagues they belong to first, each a link, with their role in each (record 066); a
// visitor sees one plain page, what SR Leagues is and "Sign in". The rest of the front
// page (finding a league, starting one) is stage 5's. It reads the session cookie, so it
// is drawn per request and a visitor's page never holds anyone's leagues. Signing out from
// a page of no league leaves the person here, told so (R-30; step 2.163), and told only
// while they are signed out. Its look is SR Leagues' own (step 2.102): a serif title in
// two lines, the second in the one blue, the way in, and what a league's site holds, only
// what is built.
const whatASiteHolds: readonly (readonly [TextKey, TextKey])[] = [
  ['front.what.schedule', 'front.what.scheduleLine'],
  ['front.what.scores', 'front.what.scoresLine'],
  ['front.what.standings', 'front.what.standingsLine'],
  ['front.what.statistics', 'front.what.statisticsLine'],
];

export default async function Page({ searchParams }: SearchProps) {
  const notice = noticeOf(await searchParams);
  const person = await signedInPerson();
  if (person.kind === 'account-problem') redirect(platformUrl('account'));
  // On the test copy only, its one line at the foot of the page (step 2.205).
  const testCopy = <TestCopyLine shown={(await webPorts()).testCopy} />;
  if (person.kind === 'visitor') {
    return (
      <StandalonePage>
        <main className="ui-message ui-page-card ui-front front">
          {notice === undefined || notice === 'codeSentAgain' ? null : (
            <p role="status" data-notice="">
              {t(notices[notice])}
            </p>
          )}
          <p className="ui-kicker">{t('front.title')}</p>
          <h1>
            <span>{t('front.hero.first')}</span> <span>{t('front.hero.second')}</span>
          </h1>
          <p>{t('front.about')}</p>
          <a
            className="ui-button"
            data-kind="main"
            data-arrow="true"
            href={screenUrl('signin', { next: platformUrl('home') })}
          >
            {t('front.signIn')}
          </a>
          <ul className="ui-what">
            {whatASiteHolds.map(([title, line]) => (
              <li key={title}>
                <strong>{t(title)}</strong>
                <span>{t(line)}</span>
              </li>
            ))}
          </ul>
          {testCopy}
        </main>
      </StandalonePage>
    );
  }
  const leagues = await leaguesOfThisRequest();
  return (
    <StandalonePage>
      <main className="ui-message ui-page-card front">
        <p className="ui-kicker">{t('front.title')}</p>
        <h1>{t('account.leagues')}</h1>
        <MyLeaguesList leagues={leagues} />
        <p data-quiet="">{t('account.signedInAs', { email: person.email })}</p>
        <a className="ui-button" data-kind="second" href={platformUrl('account')}>
          {t('account.menu.account')}
        </a>
        {testCopy}
      </main>
    </StandalonePage>
  );
}
