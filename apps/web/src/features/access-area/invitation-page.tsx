// The invitation's accept page, `/{league}/invitation` (step 2.97, P4 §4, T-226, record 086),
// where the emailed link sends the browser once it holds the link's token
// (invitation-request.ts). What it says depends only on who is looking and what the token
// gives, read on the server:
//
// - a visitor holding a token: "sign in, or create an account", each bringing them straight
//   back here; nothing about the league or the role, since nothing has been proved yet, and
//   the same at every address, whether a league is behind it or not, so a hidden league's
//   short name cannot be tested;
// - signed in, a link that works (access.read_invitation): the league, the role, the
//   account they are signed in with (T-226: any signed-in holder may accept, so they are
//   told which account will get it, and when the link was sent to another address), one
//   filled button to accept and "Use another account";
// - signed in, the account that accepted it already: "Already accepted", and the way in;
// - anything else (no token held, a wrong, used, cancelled, run-out or withdrawn one, an
//   address with no league behind it, once signed in): one page, "This link does not
//   work", the same for every case, so it tells nobody which it was.
//
// After accepting, the person lands on the league's home, in the league's own frame.
import { leagueUrl, platformUrl, readInvitation, type Role } from '@srleagues/core';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { webPorts } from '../../server/container.ts';
import {
  contextOfRequest,
  heldInvitationPath,
  heldToken,
  invitationRequest,
} from '../../server/invitation-request.ts';
import { siteOf } from '../../server/league-site.ts';
import { leagueViewOfAddress } from '../../server/load-league-page.ts';
import { t, type TextKey } from '../../server/messages.ts';
import { screenUrl } from '../../server/sign-in/problems.ts';
import { StandalonePage } from '../shell/index.ts';
import { acceptHeldInvitationAction, useAnotherAccountAction } from './invitation-actions.ts';

const roleName = (role: Role) => t(`role.${role}` as TextKey);

export async function InvitationPage() {
  const body = await InvitationBody();
  // The league's frame is drawn around the page only where the league may be shown to
  // this person (the league layout); elsewhere the page stands alone, exactly as for an
  // address with no league behind it, so a hidden league is never given away (U-9).
  return (await leagueViewOfAddress()) === null ? <StandalonePage>{body}</StandalonePage> : body;
}

async function InvitationBody() {
  const request = await invitationRequest();
  // The account page explains, and its name screen (step 2.128) comes back here.
  if (request.kind === 'account-problem')
    return redirect(screenUrl('account', { next: request.path }));
  const slug = request.kind === 'no-league' ? request.slug : request.context.league.slug;
  const here = heldInvitationPath(slug);
  const token = await heldToken();
  if (here === undefined || token === undefined) return <NotUsable />;
  // A visitor gets this one card at every address, a league behind it or not (even a
  // hidden one): nothing is looked up for them, so the answer tells them nothing.
  const visitor = request.kind === 'no-league' ? request.visitor : request.context.account === null;
  if (visitor) {
    return (
      <Card title={t('invitation.title')} state="visitor">
        <p>{t('invitation.visitor.body')}</p>
        <a className="ui-button" data-kind="main" href={screenUrl('signup', { next: here })}>
          {t('invitation.visitor.signUp')}
        </a>
        <a className="ui-button" href={screenUrl('signin', { next: here })}>
          {t('invitation.visitor.signIn')}
        </a>
      </Card>
    );
  }
  const ports = await webPorts();
  // A missing league's held invitation is read too, with an id no league has (T-449,
  // review M2): the same read, the same time, the same headers as for a hidden league.
  const asked = request.kind === 'no-league' ? request.asNoLeague : contextOfRequest(request);
  const offer = await readInvitation(asked, { token }, ports.adminAccess.deps);
  if (request.kind === 'no-league' || !offer.ok) return <NotUsable />;
  const league = request.context.league;
  // The token proved the invitation, so the league may be named, shown or not.
  const name = (await siteOf(league, ports.leagueSites)).name;
  if (offer.value.kind === 'accepted') {
    return (
      <Card title={t('invitation.accepted.title')} state="accepted">
        <p>{t('invitation.accepted.body', { role: roleName(offer.value.role), league: name })}</p>
        <a className="ui-button" data-kind="main" href={leagueUrl(league, 'home')}>
          {t('invitation.accepted.go', { league: name })}
        </a>
      </Card>
    );
  }
  const sentElsewhere =
    request.email !== null &&
    request.email.trim().toLowerCase() !== offer.value.sentTo.trim().toLowerCase();
  return (
    <Card title={t('invitation.open.title', { league: name })} state="open">
      <p>{t('invitation.open.body', { league: name, role: roleName(offer.value.role) })}</p>
      {offer.value.scope.type === 'league' ? null : <p>{t('invitation.open.program')}</p>}
      {request.email === null ? null : (
        <p>{t('invitation.open.signedInAs', { email: request.email })}</p>
      )}
      {sentElsewhere ? (
        <p className="ui-notice" data-kind="info" data-sent-elsewhere="">
          {t('invitation.open.otherAddress')}
        </p>
      ) : null}
      <form action={acceptHeldInvitationAction}>
        <button type="submit" className="ui-button" data-kind="main">
          {t('invitation.open.accept')}
        </button>
      </form>
      <form action={useAnotherAccountAction}>
        <input type="hidden" name="league" value={league.slug} />
        <button type="submit" className="ui-button">
          {t('invitation.useAnother')}
        </button>
      </form>
    </Card>
  );
}

function Card({
  title,
  state,
  children,
}: {
  readonly title: string;
  /** What the page says, for tests and pictures: `data-invitation-state`. */
  readonly state: 'visitor' | 'open' | 'accepted' | 'not-usable';
  readonly children: ReactNode;
}) {
  return (
    <main className="ui-message invitation-page" data-invitation-state={state}>
      <span className="ui-message-mark" aria-hidden="true" />
      <h1 dir="auto">{title}</h1>
      {children}
    </main>
  );
}

function NotUsable() {
  return (
    <Card title={t('invitation.notUsable.title')} state="not-usable">
      <p>{t('invitation.notUsable.body')}</p>
      <a className="ui-button" data-kind="main" href={platformUrl('home')}>
        {t('invitation.notUsable.home')}
      </a>
    </Card>
  );
}
