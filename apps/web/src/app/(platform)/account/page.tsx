import { platformUrl } from '@srleagues/core';
import type { SessionSummary } from '@srleagues/providers';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  MyLeaguesList,
  StandalonePage,
  TestCopyLine,
  waitingQuestionWords,
} from '../../../features/shell/index.ts';
import {
  LocalTime,
  OwnNameForm,
  type LocalTimeWords,
  type OwnNameWords,
  type SearchProps,
} from '../../../features/sign-in/index.ts';
import { SignOutForm } from '../../../features/tracker/index.ts';
import { webPorts } from '../../../server/container.ts';
import type { AccountProblem } from '../../../server/context.ts';
import { locale, t, type TextKey } from '../../../server/messages.ts';
import { signOutAction, signOutEverywhereAction } from '../../../server/sign-in/actions.ts';
import {
  changeOwnNameAction,
  giveOwnNameAction,
} from '../../../server/sign-in/own-name-actions.ts';
import { cookieNames } from '../../../server/sign-in/cookies.ts';
import { screenUrl } from '../../../server/sign-in/problems.ts';
import { leaguesOfThisRequest, signedInPerson } from '../../../server/signed-in-leagues.ts';
import { timeInWords } from '../../../server/sign-in/sign-in-mail.ts';

// The account page (P6 §5): the devices signed in, by device and time, with "sign
// out" and "sign out everywhere" (T-71). Signed out, it sends the person to sign in.
// Either one also clears the games the tracker kept on this device (T-115).
// Signed in to a session that is none of our accounts' (record 055), it says so
// plainly and still offers to sign out; every league page sends such a person here.
// Since step 2.127 it says first who is signed in (the address the sign-in service holds
// for the session), then lists the leagues they belong to with their role in each, each a
// link (P2 line 71; record 066), before the devices.
// Since step 2.163 (M26, M30, L10): this device first and said to be this one; each time in
// the reader's own time ("today at 8:41 PM"), by their browser (local-time.tsx); a list that
// could not be read says so; and "Sign out everywhere" asks first, on this page
// (`?ask=signOutEverywhere`, so it works with scripts off), with a way back.
export default async function Page({ searchParams }: SearchProps) {
  // The cookies first: this makes the page drawn per request, never at build time.
  // The session is identified once for the whole request (this-request.ts).
  const accessToken = (await cookies()).get(cookieNames.session)?.value ?? '';
  const asking = (await searchParams)['ask'] === 'signOutEverywhere';
  const ports = await webPorts();
  const who = await signedInPerson();
  if (who.kind === 'account-problem') {
    return who.problem === 'name-needed' ? (
      <NameScreen />
    ) : (
      <AccountProblemPage problem={who.problem} />
    );
  }
  if (who.kind === 'visitor') redirect(screenUrl('signin', { next: platformUrl('account') }));
  const listed = await ports.signIn.listSessions({ accessToken });
  // This device first, then the others, most recent first, as the service lists them.
  const sessions: readonly SessionSummary[] = listed.ok
    ? [...listed.value.filter((s) => s.current), ...listed.value.filter((s) => !s.current)]
    : [];
  const leagues = await leaguesOfThisRequest();
  const name = await ports.ownName.read(who.accountId);
  return (
    <StandalonePage>
      <main className="ui-message ui-form-card account">
        {/* Our name as the kicker, like every other card (step 2.102's fix round), and who
            is signed in under it, above everything else (step 2.127). */}
        <p className="ui-kicker">{t('shell.siteName')}</p>
        <p className="account-who">{t('account.signedInAs', { email: who.email })}</p>
        <h1>{t('page.account')}</h1>
        <h2>{t('account.name.heading')}</h2>
        <p>{t('account.name.help')}</p>
        <OwnNameForm
          action={changeOwnNameAction}
          initial={{
            firstName: name?.firstName ?? '',
            lastName: name?.lastName ?? '',
            problem: null,
            saved: false,
            round: 0,
          }}
          words={ownNameWords()}
          mark="change"
        />
        <h2>{t('account.leagues')}</h2>
        <MyLeaguesList leagues={leagues} />
        <h2>{t('account.devices')}</h2>
        {sessions.length === 0 ? (
          <p data-devices-unreadable="">{t('account.devicesUnreadable')}</p>
        ) : (
          <ul className="ui-rows">
            {sessions.map((session) => (
              <li key={session.sessionId} data-this-device={session.current ? '' : undefined}>
                <strong>{session.deviceLabel}</strong>
                {session.current ? <em> · {t('account.thisDevice')}</em> : null}
                <br />
                <LocalTime
                  at={session.signedInAt.toISOString()}
                  utcWords={timeInWords(session.signedInAt)}
                  locale={locale}
                  words={lineWords('account.signedInAt')}
                />
                <br />
                <LocalTime
                  at={session.lastActiveAt.toISOString()}
                  utcWords={timeInWords(session.lastActiveAt)}
                  locale={locale}
                  words={lineWords('account.lastActive')}
                />
              </li>
            ))}
          </ul>
        )}
        <SignOutForm action={signOutAction} waitingQuestion={waitingQuestionWords()}>
          <button className="ui-button" data-kind="second" type="submit">
            {t('account.signOut')}
          </button>
        </SignOutForm>
        {asking ? (
          <section className="ui-apart account-ask" aria-labelledby="sign-out-everywhere-ask">
            <p id="sign-out-everywhere-ask">{t('account.signOutEverywhereAsk')}</p>
            <SignOutForm action={signOutEverywhereAction} waitingQuestion={waitingQuestionWords()}>
              <button className="ui-button" data-kind="danger" type="submit">
                {t('account.signOutEverywhereConfirm')}
              </button>
            </SignOutForm>
            <a className="ui-button" data-kind="quiet" href={platformUrl('account')}>
              {t('account.signOutEverywhereKeep')}
            </a>
          </section>
        ) : (
          // Set apart from "Sign out" by a hairline and space, never beside it (M25).
          <div className="ui-apart account-everywhere">
            <p>{t('account.signOutEverywhereHelp')}</p>
            <a
              className="ui-button"
              data-kind="quiet"
              href={screenUrl('account', { ask: 'signOutEverywhere' })}
            >
              {t('account.signOutEverywhere')}
            </a>
          </div>
        )}
        {/* At its foot, on the test copy only (step 2.205). */}
        <TestCopyLine shown={ports.testCopy} />
      </main>
    </StandalonePage>
  );
}

/** A device line's words with a hole for the time, and the ways to say a time. */
function lineWords(line: 'account.signedInAt' | 'account.lastActive'): LocalTimeWords {
  const hole = '\u0000';
  const [before = '', after = ''] = t(line, { when: hole }).split(hole);
  return {
    before,
    after,
    today: t('account.when.today', { time: '{time}' }),
    yesterday: t('account.when.yesterday', { time: '{time}' }),
    day: t('account.when.day', { date: '{date}', time: '{time}' }),
  };
}

const problemText = {
  'sign-in-link-conflict': 'account.problem.linkConflict',
  'address-not-confirmed': 'account.problem.notConfirmed',
  'address-refused': 'account.problem.addressRefused',
  'name-needed': 'account.name.intro',
} as const satisfies Record<AccountProblem, TextKey>;

function ownNameWords(): OwnNameWords {
  return {
    firstName: t('account.name.firstName'),
    lastName: t('account.name.lastName'),
    save: t('account.name.save'),
    saved: t('account.name.saved'),
    problems: {
      invalid: t('account.name.invalid'),
      alreadyNamed: t('account.name.alreadyNamed'),
      noNameYet: t('account.name.noNameYet'),
    },
  };
}

/**
 * The one screen that asks a new account's first and last name, once (R-21, step 2.128):
 * every page sends a signed-in person here until they have answered; they can still sign out.
 */
function NameScreen() {
  return (
    <StandalonePage>
      <main className="ui-message ui-form-card account" data-name-screen="">
        <p className="ui-kicker">{t('shell.siteName')}</p>
        <h1>{t('account.name.title')}</h1>
        <p>{t('account.name.intro')}</p>
        <OwnNameForm
          action={giveOwnNameAction}
          initial={{ firstName: '', lastName: '', problem: null, saved: false, round: 0 }}
          words={ownNameWords()}
          mark="give"
        />
        <form action={signOutAction}>
          <button className="ui-button" data-kind="quiet" type="submit">
            {t('account.signOut')}
          </button>
        </form>
      </main>
    </StandalonePage>
  );
}

/** What is wrong with the account, in plain words, and signing out (record 055). */
function AccountProblemPage({ problem }: { readonly problem: AccountProblem }) {
  return (
    <StandalonePage>
      <main className="ui-message ui-form-card account">
        <p className="ui-kicker">{t('shell.siteName')}</p>
        <h1>{t('account.problem.title')}</h1>
        <p>{t(problemText[problem])}</p>
        <form action={signOutAction}>
          <button className="ui-button" data-kind="main" type="submit">
            {t('account.signOut')}
          </button>
        </form>
      </main>
    </StandalonePage>
  );
}
