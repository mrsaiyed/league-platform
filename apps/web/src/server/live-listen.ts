// Who may listen to a live channel on the local stand-in hub (record 021, U-9): the
// same rule as the league's pages. A channel names its league by id; that league must
// exist, not be in the bin, and be one this person may open (mayOpenLeague): anyone
// for a live or archived league, its staff for a draft, its owner and admins when
// suspended. Who is asking comes from the session cookie the request carries, as for
// every page; a cookie that no longer identifies anyone listens as a visitor.
import type { LiveChannel } from '@srleagues/contracts';
import { mayOpenLeague } from '@srleagues/core';
import type { LiveAuthorize } from '@srleagues/providers';
import type { WebPorts } from './ports.ts';
import { sessionCookieName } from './session-cookie.ts';

export type LiveListenDeps = Pick<
  WebPorts,
  'identify' | 'findLeagueById' | 'accessOf' | 'newRequestId'
>;

/** The value of one cookie in a Cookie header, or undefined. */
export function cookieValue(header: string | null, name: string): string | undefined {
  if (header === null) return undefined;
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at === -1) continue;
    if (part.slice(0, at).trim() !== name) continue;
    const value = part.slice(at + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function liveListenAuthorize(deps: LiveListenDeps): LiveAuthorize {
  return async (channel: LiveChannel, request: Request) => {
    const leagueId = channel.leagueId.toLowerCase();
    const league = await deps.findLeagueById(leagueId);
    if (league === undefined || league.id.toLowerCase() !== leagueId) return false;
    const token = cookieValue(request.headers.get('cookie'), sessionCookieName);
    let accountId: string | null = null;
    if (token !== undefined && token !== '') {
      const identity = await deps.identify(token);
      if (identity.ok) accountId = identity.value.accountId.toLowerCase();
    }
    const holder =
      accountId === null
        ? undefined
        : await deps.accessOf({ leagueId, accountId, requestId: deps.newRequestId() });
    return mayOpenLeague(league.status, holder);
  };
}
