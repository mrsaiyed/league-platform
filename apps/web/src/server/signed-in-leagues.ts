// Who is signed in on one of our own pages (`/`, `/account`), and the leagues they
// belong to (record 066), for those pages only. The account is the session's, read
// from its cookie by the sign-in service (T-6), never one from the request; the list is
// core's myLeagues, which drops every league the person may not see (U-9) before its
// name comes back. A league's name is the one its own pages show (league-site.ts).
import { myLeagues, type MyLeague } from '@srleagues/core';
import { cookies } from 'next/headers';
import { webPorts } from './container.ts';
import type { AccountProblem } from './context.ts';
import { leagueSites } from './league-site.ts';
import { cookieNames } from './sign-in/cookies.ts';

export type SignedInPerson =
  | { readonly kind: 'visitor' }
  /** A live session that is none of our accounts' (record 055): the account page explains. */
  | { readonly kind: 'account-problem'; readonly problem: AccountProblem }
  | {
      readonly kind: 'signed-in';
      readonly accountId: string;
      /** The address the sign-in service holds for the session. */
      readonly email: string;
    };

/** The person this request's session cookie is, read per request (it reads the cookies). */
export async function signedInPerson(): Promise<SignedInPerson> {
  const accessToken = (await cookies()).get(cookieNames.session)?.value ?? '';
  if (accessToken === '') return { kind: 'visitor' };
  const who = await (await webPorts()).identify(accessToken);
  if (who.ok) {
    return {
      kind: 'signed-in',
      accountId: who.value.accountId.toLowerCase(),
      email: who.value.email,
    };
  }
  return who.error.code === 'account-problem'
    ? { kind: 'account-problem', problem: who.error.problem }
    : { kind: 'visitor' };
}

/** The leagues `accountId` (the session's) belongs to and may see, by the names their pages show. */
export async function leaguesOf(accountId: string): Promise<readonly MyLeague[]> {
  const ports = await webPorts();
  const sites = leagueSites();
  const found = await myLeagues(accountId, () => ports.leaguesOfAccount(accountId));
  return found
    .map((league) => ({ ...league, name: sites(league.leagueId)?.name ?? league.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en') || a.leagueId.localeCompare(b.leagueId));
}
