// Fence 1 (T4 §2) and the second half of T-34: the only place a request becomes
// "who is asking, and about which league". Every command and query gets its league
// and account from what this returns; nothing the browser sends in a body, a query
// or a header of its own choosing can set them.
//
// It is a plain function of the request's facts, so it is tested without a server:
// the host and path as they arrived, the sign-in service's answer to "who is this?"
// for the session cookie (identify), and a way to look a short name up. The Next.js
// side (step 1.17) reads those from the request, calls this, and acts on a refusal.
//
// Today a page's league is the first part of the path (U-1). Moving to league
// subdomains (U-13) or a league's own domain (U-2) changes this file and the address
// builder (leagueUrl), and nothing else.
//
// The JSON endpoints (T-26) name their league by its id instead:
// `/api/v1/leagues/{leagueId}/...` (record 017, T-229). An id never changes, so a
// tracker's queued commands still reach the league after a change of short name. A
// handler under that address gets its league here like any page; one under any other
// `/api/...` address gets a platform context, with no league.
import {
  fail,
  forwardedLeagueUrl,
  isLeagueIdFormat,
  isShortNameFormat,
  isSystemShortName,
  leagueApiBase,
  ok,
  type CommandContext,
  type LeagueStatus,
  type Result,
} from '@srleagues/core';
import type { SessionError, SessionIdentity } from '@srleagues/providers';

/**
 * Why a session the sign-in service accepts still belongs to none of our accounts
 * (record 055). `sign-in-link-conflict`: the account for its address is linked to
 * another sign-in user, which is put right by hand (record 052). The person stays
 * signed in, is told so plainly on the account page and may sign out there.
 */
export type AccountProblem = 'sign-in-link-conflict';

export type AccountRefusal = { readonly code: 'account-problem'; readonly problem: AccountProblem };

/** The web app's "who is this?" refusals: the service's own, or ours (AccountRefusal). */
export type IdentifyError = SessionError | AccountRefusal;

/** What the request itself says, before anything is believed. */
export type RequestFacts = {
  /** The Host the request was sent to, as received. */
  readonly host: string;
  /** The path and query as received, still percent-encoded: `/north-league/teams?season=x`. */
  readonly path: string;
  /** The sign-in service's identify answer for the session cookie, or null with no cookie. */
  readonly session: Result<SessionIdentity, IdentifyError> | null;
};

/** The league a short name names, as the narrow lookup answers it (T-221). */
export type FoundLeague = {
  readonly leagueId: string;
  /** Its current short name. */
  readonly slug: string;
  readonly status: LeagueStatus;
  readonly inBin: boolean;
  /** The name asked for is a former one, still forwarding (U-7). */
  readonly forwarded: boolean;
};

/** The league an endpoint's id names, as the league's own transaction reads it. */
export type LeagueById = {
  readonly id: string;
  readonly slug: string;
  readonly status: LeagueStatus;
};

export type ContextDeps = {
  /** Our site's origin, PUBLIC_BASE_URL (T-30). Requests to any other host are refused. */
  readonly siteOrigin: string;
  /** The league a short name names: current or forwarding, or undefined. */
  readonly findLeague: (shortName: string) => Promise<FoundLeague | undefined>;
  /**
   * The league with this id, read in a transaction for that league; undefined when
   * there is none or it is in the bin (the database's findCurrentLeague answers this).
   */
  readonly findLeagueById: (leagueId: string) => Promise<LeagueById | undefined>;
  /**
   * A new id for this request, shared by everything done for it so its log lines go
   * together (T-196). Made by the server: never taken from a header the browser sent.
   */
  readonly newRequestId: () => string;
};

/**
 * The signed-in person, as far as a request needs to know. Their email stays with
 * the sign-in service: it is personal and nothing here needs it (T-29, T-86).
 */
export type SignedInAccount = {
  readonly accountId: string;
  readonly sessionId: string;
  readonly hasPassword: boolean;
  /** For the "password again" rule before sensitive actions (T-70). */
  readonly passwordEnteredAt: Date | null;
  readonly lastSignInAt: Date;
};

/** A request for one of our own pages (`/`, `/account`, `/signin`...): no league. */
export type PlatformRequestContext = {
  readonly kind: 'platform';
  readonly requestId: string;
  readonly account: SignedInAccount | null;
};

/**
 * A request about one league. Its state comes with it: who may see a draft or a
 * suspended league is decided with their roles (U-9, step 1.17), not here.
 */
export type LeagueRequestContext = {
  readonly kind: 'league';
  readonly requestId: string;
  readonly account: SignedInAccount | null;
  readonly league: {
    readonly id: string;
    readonly slug: string;
    readonly status: LeagueStatus;
  };
};

export type RequestContext = PlatformRequestContext | LeagueRequestContext;

/**
 * Why no context was made, and what the caller does about it:
 * - `unknown-host`: not one of our addresses; answer "not found".
 * - `renew-session`: the access token ran out; renew it with the refresh token and
 *   build the context again.
 * - `session-ended`: the session is over; clear its cookies and build the context again
 *   with no session.
 * - `league-not-found`: no league has that short name or id, or it is in the bin.
 * - `league-moved`: a former short name, other capitals or another spelling of the
 *   name (`%2D` for `-`); forward permanently to `to`, the same page under the
 *   league's one proper address (U-7). The league's id and state come with it: a
 *   draft or suspended league is forwarded only for those who may see it, and is
 *   "not found" for everyone else (U-9, step 1.17), so a forward never shows that
 *   such a league exists.
 * - `forward`: one of our own pages spelled another way (`/Account`, `/%61ccount`);
 *   forward permanently to `to`, its one proper address.
 * - `account-problem`: the session is live but is none of our accounts' (AccountRefusal);
 *   send the person to the account page, which explains it and offers to sign out.
 */
export type ContextRefusal =
  | { readonly code: 'unknown-host' }
  | { readonly code: 'renew-session' }
  | { readonly code: 'session-ended' }
  | AccountRefusal
  | { readonly code: 'league-not-found' }
  | {
      readonly code: 'league-moved';
      readonly to: string;
      readonly leagueId: string;
      readonly status: LeagueStatus;
    }
  | { readonly code: 'forward'; readonly to: string };

export async function requestContext(
  facts: RequestFacts,
  deps: ContextDeps,
): Promise<Result<RequestContext, ContextRefusal>> {
  if (!isOurHost(facts.host, deps.siteOrigin)) return fail({ code: 'unknown-host' });

  let account: SignedInAccount | null = null;
  if (facts.session !== null) {
    if (!facts.session.ok) {
      const error = facts.session.error;
      if (error.code === 'account-problem') return fail(error);
      return fail({ code: error.code === 'access-expired' ? 'renew-session' : 'session-ended' });
    }
    account = signedInAccount(facts.session.value);
  }

  const address = splitPath(facts.path);
  if (address === undefined) return fail({ code: 'league-not-found' });
  const { raw, first, below } = address;
  if (first === '') return ok({ kind: 'platform', requestId: deps.newRequestId(), account });

  // Our own words are our pages, never a league. Only those: a name refused for being
  // offensive is not a page of ours, and simply finds no league.
  if (isSystemShortName(first)) {
    const word = first.toLowerCase();
    if (raw !== word) return fail({ code: 'forward', to: `/${word}${below}` });
    if (word === leagueApiBase[0]) return apiContext(facts.path, account, deps);
    return ok({ kind: 'platform', requestId: deps.newRequestId(), account });
  }

  // Short names are lower case (U-7): other capitals find the league and forward.
  const shortName = first.toLowerCase();
  if (!isShortNameFormat(shortName)) return fail({ code: 'league-not-found' });
  const found = await deps.findLeague(shortName);
  if (found === undefined || found.inBin) return fail({ code: 'league-not-found' });
  // Served only at its one proper spelling; anything else forwards there.
  if (raw !== found.slug) {
    // A name the address builder would refuse is a fault in the data, not a page.
    if (!isShortNameFormat(found.slug)) return fail({ code: 'league-not-found' });
    return fail({
      code: 'league-moved',
      to: forwardedLeagueUrl({ slug: found.slug }, below),
      leagueId: found.leagueId.toLowerCase(),
      status: found.status,
    });
  }
  return ok({
    kind: 'league',
    requestId: deps.newRequestId(),
    account,
    league: { id: found.leagueId.toLowerCase(), slug: found.slug, status: found.status },
  });
}

/**
 * An endpoint's context. `/api/v1/leagues/{leagueId}/...` is about that league, the
 * id spelled exactly as leagueApiUrl spells it; any other `/api/...` address has none.
 */
async function apiContext(
  path: string,
  account: SignedInAccount | null,
  deps: ContextDeps,
): Promise<Result<RequestContext, ContextRefusal>> {
  const parts = (path.split(/[?#]/)[0] ?? '').slice(1).split('/');
  const underLeagues = leagueApiBase.every((part, index) => parts[index] === part);
  if (!underLeagues) return ok({ kind: 'platform', requestId: deps.newRequestId(), account });
  const leagueId = parts[leagueApiBase.length] ?? '';
  if (!isLeagueIdFormat(leagueId)) return fail({ code: 'league-not-found' });
  const found = await deps.findLeagueById(leagueId);
  if (found === undefined || found.id.toLowerCase() !== leagueId) {
    return fail({ code: 'league-not-found' });
  }
  return ok({
    kind: 'league',
    requestId: deps.newRequestId(),
    account,
    league: { id: leagueId, slug: found.slug, status: found.status },
  });
}

/** What a command is given for a league request (T-23): from here, never from the input. */
export function commandContextOf(context: LeagueRequestContext): CommandContext {
  return {
    leagueId: context.league.id,
    accountId: context.account?.accountId ?? null,
    requestId: context.requestId,
  };
}

function signedInAccount(identity: SessionIdentity): SignedInAccount {
  return {
    accountId: identity.accountId.toLowerCase(),
    sessionId: identity.sessionId,
    hasPassword: identity.hasPassword,
    passwordEnteredAt: identity.passwordEnteredAt,
    lastSignInAt: identity.lastSignInAt,
  };
}

/** Whether `host` is our site's host, port included; a missing default port is the same. */
function isOurHost(host: string, siteOrigin: string): boolean {
  const ours = new URL(siteOrigin);
  if (host === '' || /[\s/\\?#@]/.test(host)) return false;
  let given: URL;
  try {
    given = new URL(`${ours.protocol}//${host}`);
  } catch {
    return false;
  }
  return given.host === ours.host;
}

/**
 * The first part of the path as it came (`raw`) and decoded (`first`), and everything
 * after it exactly as it came: `/north-league/teams?x=1` is `north-league` and
 * `/teams?x=1`. Undefined for a path that is not one (it does not start with `/`, or
 * its first part cannot be decoded).
 */
function splitPath(path: string): { raw: string; first: string; below: string } | undefined {
  if (!path.startsWith('/')) return undefined;
  const end = path.slice(1).search(/[/?#]/);
  const raw = end === -1 ? path.slice(1) : path.slice(1, end + 1);
  const below = end === -1 ? '' : path.slice(end + 1);
  try {
    return { raw, first: decodeURIComponent(raw), below: below.startsWith('#') ? '' : below };
  } catch {
    return undefined;
  }
}
