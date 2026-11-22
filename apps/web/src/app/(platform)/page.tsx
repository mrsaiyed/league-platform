import { platformUrl } from '@srleagues/core';
import { redirect } from 'next/navigation';
import { MyLeaguesList, StandalonePage, TestCopyLine } from '../../features/shell/index.ts';
import { webPorts } from '../../server/container.ts';
import { t } from '../../server/messages.ts';
import { screenUrl } from '../../server/sign-in/problems.ts';
import { leaguesOfThisRequest, signedInPerson } from '../../server/signed-in-leagues.ts';

// Our front page (P2 line 67), as far as step 2.127 builds it: a signed-in person sees
// the leagues they belong to first, each a link, with their role in each (record 066); a
// visitor sees one plain page, what SR Leagues is and "Sign in". The rest of the front
// page (finding a league, starting one) is stage 5's. It reads the session cookie, so it
// is drawn per request and a visitor's page never holds anyone's leagues.
export default async function Page() {
  const person = await signedInPerson();
  if (person.kind === 'account-problem') redirect(platformUrl('account'));
  // On the test copy only, its one line at the foot of the page (step 2.205).
  const testCopy = <TestCopyLine shown={(await webPorts()).testCopy} />;
  if (person.kind === 'visitor') {
    return (
      <StandalonePage>
        <main className="ui-message front">
          <h1>{t('front.title')}</h1>
          <p>{t('front.about')}</p>
          <a
            className="ui-button"
            data-kind="main"
            href={screenUrl('signin', { next: platformUrl('home') })}
          >
            {t('front.signIn')}
          </a>
          {testCopy}
        </main>
      </StandalonePage>
    );
  }
  const leagues = await leaguesOfThisRequest();
  return (
    <StandalonePage>
      <main className="ui-message front">
        <h1>{t('account.leagues')}</h1>
        <MyLeaguesList leagues={leagues} />
        <p>{t('account.signedInAs', { email: person.email })}</p>
        <a className="ui-button" href={platformUrl('account')}>
          {t('account.menu.account')}
        </a>
        {testCopy}
      </main>
    </StandalonePage>
  );
}
