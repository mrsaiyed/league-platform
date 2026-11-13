// What a request for one of a league's pages gets (U-6, U-9), decided before any
// page is drawn. Plain functions of the request's facts and the ports, so they are
// tested without a server; load-league-page.ts turns the answer into Next.js's
// "not found", "forward" and "forbidden".
//
// - A league that does not exist, is in the bin, or is hidden from this person (a
//   draft or a suspended league, to anyone but its owner and admins) is "not found",
//   the same answer for all three, so a hidden league is never given away (U-9). A
//   former short name forwards only for those who may see the league.
// - An admin address or the tracker, in a league this person may see, without the
//   access it needs, is "no access", whoever they are (U-6). The address shows
//   where you ask to go; it never proves you may.
//
// A request is worked out once (resolveLeagueRequest: one request id, one read of
// the person's access), and each layout and page of it then gets its own answer
// (leaguePageOutcome). The page must also be the one Next.js chose for the address
// the proxy wrote down (addressMatchesRoute): if not, the proxy did not run for this
// request, and the answer is "not found" rather than trust a header (record 020).
import {
  mayOpenLeague,
  mayOpenTracker,
  openAdminAreas,
  type AccessHolder,
  type AdminArea,
} from '@srleagues/core';
import {
  commandContextOf,
  requestContext,
  type ContextDeps,
  type LeagueRequestContext,
  type RequestFacts,
} from './context.ts';
import type { WebPorts } from './ports.ts';

/** The kind of league page asked for. `area` null is the admin's home. */
export type LeagueWant =
  | { readonly page: 'site' }
  | { readonly page: 'admin'; readonly area: AdminArea | null }
  | { readonly page: 'score' };

/** What a page that may be shown knows about who is looking. */
export type LeagueView = {
  readonly context: LeagueRequestContext;
  /** The admin areas open to this person, in order; empty for visitors. */
  readonly areas: readonly AdminArea[];
  /** Whether this person runs the league (has any area of the admin). */
  readonly runsTheLeague: boolean;
};

export type LeagueOutcome =
  | { readonly kind: 'show'; readonly view: LeagueView }
  | { readonly kind: 'not-found' }
  /** Forward permanently to the one proper address. */
  | { readonly kind: 'forward'; readonly to: string }
  /** U-6: "you do not have access". */
  | { readonly kind: 'no-access'; readonly signedIn: boolean };

export type GateDeps = ContextDeps & Pick<WebPorts, 'accessOf'>;

/**
 * A request about one league, worked out once: either its answer already (the
 * league is not there for this person, or the address forwards), or the league and
 * what this person holds in it.
 */
export type ResolvedLeagueRequest =
  | { readonly kind: 'settled'; readonly outcome: LeagueOutcome }
  | {
      readonly kind: 'league';
      readonly context: LeagueRequestContext;
      readonly holder: AccessHolder | undefined;
    };

const settled = (outcome: LeagueOutcome): ResolvedLeagueRequest => ({ kind: 'settled', outcome });

export async function resolveLeagueRequest(
  facts: RequestFacts,
  deps: GateDeps,
): Promise<ResolvedLeagueRequest> {
  // One id for everything done for this request, a forward's access read included.
  const requestId = deps.newRequestId();
  return resolveWith(facts, { ...deps, newRequestId: () => requestId });
}

async function resolveWith(facts: RequestFacts, deps: GateDeps): Promise<ResolvedLeagueRequest> {
  const built = await requestContext(facts, deps);
  if (!built.ok) {
    const refusal = built.error;
    switch (refusal.code) {
      case 'unknown-host':
      case 'league-not-found':
        return settled({ kind: 'not-found' });
      case 'forward':
        return settled({ kind: 'forward', to: refusal.to });
      // Renewing a session and clearing an ended one are the sign-in screens' work
      // (step 1.14). Until then the page is drawn as for a visitor.
      case 'renew-session':
      case 'session-ended':
        return resolveWith({ ...facts, session: null }, deps);
      case 'league-moved': {
        const accountId =
          facts.session !== null && facts.session.ok
            ? facts.session.value.accountId.toLowerCase()
            : null;
        const holder = await deps.accessOf({
          leagueId: refusal.leagueId,
          accountId,
          requestId: deps.newRequestId(),
        });
        return settled(
          mayOpenLeague(refusal.status, holder)
            ? { kind: 'forward', to: refusal.to }
            : { kind: 'not-found' },
        );
      }
    }
  }

  const context = built.value;
  // One of our own words (`/api`, `/admin`) reached a league's page: there is none.
  if (context.kind !== 'league') return settled({ kind: 'not-found' });
  const holder =
    context.account === null ? undefined : await deps.accessOf(commandContextOf(context));
  if (!mayOpenLeague(context.league.status, holder)) return settled({ kind: 'not-found' });
  return { kind: 'league', context, holder };
}

/** The answer for one kind of page, from a request worked out once. */
export function leaguePageOutcome(
  resolved: ResolvedLeagueRequest,
  want: LeagueWant,
): LeagueOutcome {
  if (resolved.kind === 'settled') return resolved.outcome;
  const { context, holder } = resolved;
  const areas = openAdminAreas(holder);
  const allowed =
    want.page === 'site' ||
    (want.page === 'score' && mayOpenTracker(holder)) ||
    (want.page === 'admin' && (want.area === null ? areas.length > 0 : areas.includes(want.area)));
  if (!allowed) return { kind: 'no-access', signedIn: context.account !== null };
  return { kind: 'show', view: { context, areas, runsTheLeague: areas.length > 0 } };
}

/** Both steps at once, for one page. */
export async function leagueOutcome(
  facts: RequestFacts,
  want: LeagueWant,
  deps: GateDeps,
): Promise<LeagueOutcome> {
  return leaguePageOutcome(await resolveLeagueRequest(facts, deps), want);
}

/**
 * Whether the league part of the address the proxy wrote down (`path`) names the
 * same page as Next.js's `[league]` value (`routeLeague`), ignoring capitals: those
 * forward. They differ only when the proxy did not run and the header came from
 * the browser, or is missing; the page then answers "not found".
 */
export function addressMatchesRoute(path: string, routeLeague: string): boolean {
  if (!path.startsWith('/')) return false;
  const raw = path.slice(1).split(/[/?#]/)[0] ?? '';
  const first = decodeOnce(raw);
  if (first === undefined || first === '') return false;
  const route = routeLeague.toLowerCase();
  const routeDecoded = decodeOnce(routeLeague)?.toLowerCase();
  const asked = first.toLowerCase();
  return asked === route || asked === routeDecoded;
}

function decodeOnce(text: string): string | undefined {
  try {
    return decodeURIComponent(text);
  } catch {
    return undefined;
  }
}
