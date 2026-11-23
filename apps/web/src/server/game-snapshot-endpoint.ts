// GET /api/v1/leagues/{leagueId}/games/{game}/snapshot (T6 §6; T-118, T-119; record
// 039): the game as it stands, for a viewer's page that is arriving, found a gap in the
// live messages, or cannot hold a live connection. It is read as a visitor, the same
// view every live message carries, so it is the same for everyone who may see the
// league: a live or archived league's snapshot is cached for 2 seconds by the cache in
// front of the site (T-119), so a thousand viewers polling cost one read every 2
// seconds. A draft or suspended league's is never cached: only its staff may see it
// (mayOpenLeague, U-9), and anyone else is told "not found", as by its pages.
//
// A request that carries any sign-in cookie is answered private, never cached: the
// proxy may renew its session on the way in and set new cookies on this very answer
// (proxy.ts, renew-session.ts), and an answer that sets cookies must never be kept by
// a shared cache, which would hand one person's session to the next viewer.
//
// A shared answer is labeled with its league and its game (step 2.26, cache-headers.ts), so
// the worker's `cache.clear` drops it the moment the game is decided or reopened.
//
// The game and the league's name settings are read in one snapshot (gameReadsOf, record
// 076), so a name is shown by the settings as they stood when the game was read.
import { mayOpenLeague, publicViewer, readGameSnapshot } from '@srleagues/core';
import { gamePageLabel, leagueLabel } from '@srleagues/providers';
import { longestSharedSeconds, notKept, sharedFor } from './cache-headers.ts';
import { isGameIdFormat, type ApiAnswer, type LeagueApiRequest } from './league-api.ts';
import type { TrackerPorts } from './tracker-ports.ts';

const notFound: ApiAnswer = {
  status: 404,
  body: { error: 'not-found' },
  headers: { 'Cache-Control': 'no-store' },
};

export async function gameSnapshot(
  request: LeagueApiRequest & {
    /** Whether the request carried a sign-in cookie (session or renewing token). */
    readonly carriesSignIn: boolean;
  },
  game: string,
  ports: Pick<TrackerPorts, 'gameReadsOf' | 'clock'>,
): Promise<ApiAnswer> {
  const { league } = request.context;
  if (!mayOpenLeague(league.status, request.holder)) return notFound;
  if (!isGameIdFormat(game)) return notFound;
  const read = await ports.gameReadsOf(league.id, ({ store, audience, policy }) =>
    readGameSnapshot(
      store,
      { gameId: game },
      { leagueId: league.id, viewer: publicViewer(league.id), audience, policy },
      ports.clock.now(),
    ),
  );
  if (!read.ok) return notFound;
  const shared =
    (league.status === 'live' || league.status === 'archived') && !request.carriesSignIn;
  return {
    status: 200,
    body: read.value,
    headers: shared
      ? sharedFor(longestSharedSeconds, [leagueLabel(league.id), gamePageLabel(league.id, game)])
      : notKept,
  };
}
