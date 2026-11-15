// Who is signed in on one of our own pages (`/`, `/account`), and the leagues they
// belong to (record 066), for those pages only. The account is the session's, read once
// per request from its cookie by the sign-in service (this-request.ts), never one from
// the request; the list is core's myLeagues, which drops every league the person may not
// see (U-9) before its name comes back. A league's name is the one its own pages show
// (league-site.ts).
//
// This is the one caller of the leaguesOfAccount port, and it passes only the session's
// account: no function here takes an account id (signed-in-leagues.test.ts checks that
// nothing else calls the port).
import { myLeagues, type MyLeague } from '@srleagues/core';
import type { AccountProblem, RequestFacts } from './context.ts';
import { leagueSites, type LeagueSiteSource } from './league-site.ts';
import type { WebPorts } from './ports.ts';
import { thisRequestFacts } from './this-request.ts';
import { webPorts } from './container.ts';

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

/** Who the session in `facts` is: a visitor too when it has ended or ran out. */
export function personOf(facts: RequestFacts): SignedInPerson {
  const session = facts.session;
  if (session === null) return { kind: 'visitor' };
  if (session.ok) {
    return {
      kind: 'signed-in',
      accountId: session.value.accountId.toLowerCase(),
      email: session.value.email,
    };
  }
  return session.error.code === 'account-problem'
    ? { kind: 'account-problem', problem: session.error.problem }
    : { kind: 'visitor' };
}

/** The person this request's session cookie is, read once per request. */
export async function signedInPerson(): Promise<SignedInPerson> {
  return personOf(await thisRequestFacts());
}

/**
 * The leagues `person` belongs to and may see, by the names their pages show; none for
 * anyone not signed in. `person` is what signedInPerson read from this request's session.
 */
export async function leaguesOfPerson(
  person: SignedInPerson,
  ports: Pick<WebPorts, 'leaguesOfAccount'>,
  sites: LeagueSiteSource,
): Promise<readonly MyLeague[]> {
  if (person.kind !== 'signed-in') return [];
  const { accountId } = person;
  const found = await myLeagues(accountId, () => ports.leaguesOfAccount(accountId));
  return found
    .map((league) => ({ ...league, name: sites(league.leagueId)?.name ?? league.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en') || a.leagueId.localeCompare(b.leagueId));
}

/** The leagues of the person signed in on this request (the front and account pages). */
export async function leaguesOfThisRequest(): Promise<readonly MyLeague[]> {
  return leaguesOfPerson(await signedInPerson(), await webPorts(), leagueSites());
}
