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
import { mayOpenLeague, publicViewer, readGameSnapshot } from '@srleagues/core';
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
  ports: Pick<TrackerPorts, 'snapshotStoreOf' | 'namesShownOf' | 'clock'>,
): Promise<ApiAnswer> {
  const { league } = request.context;
  if (!mayOpenLeague(league.status, request.holder)) return notFound;
  if (!isGameIdFormat(game)) return notFound;
  const names = await ports.namesShownOf(league.id);
  const read = await readGameSnapshot(
    ports.snapshotStoreOf(league.id),
    { gameId: game },
    {
      leagueId: league.id,
      viewer: publicViewer(league.id),
      audience: names.audience,
      policy: names.policy,
    },
    ports.clock.now(),
  );
  if (!read.ok) return notFound;
  const shared =
    (league.status === 'live' || league.status === 'archived') && !request.carriesSignIn;
  return {
    status: 200,
    body: read.value,
    headers: {
      'Cache-Control': shared ? 'public, max-age=0, s-maxage=2' : 'private, no-store',
    },
  };
}
