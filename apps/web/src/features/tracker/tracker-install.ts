// The tracker as an app on the device's home screen (step 2.38, T-115): the answers of its
// web app manifest and of its worker, at the league's addresses beside the games'
// (app/[league]/score/manifest.webmanifest and tracker-worker.js). Both are the same for
// every league: the tracker has one look of its own (docs/build/DESIGN.md section 7, record
// 064), so nothing of a league is read, and a league that does not exist or is hidden is
// told apart from no other by them.
import { leagueUrl } from '@srleagues/core';
import { isGameIdFormat } from '../../server/league-api.ts';
import { t } from '../../server/messages.ts';
import { trackerScopeOf } from './tracker-worker-rules.ts';
import { trackerWorkerScript } from './tracker-worker-script.ts';

/** The tracker's own frame colour (court.css, `--court-page`): the same for every league. */
const trackerColour = '#121110';

/** The icons: made for the tracker, the same for every league (apps/web/public). */
const icons = [192, 512].map((size) => ({
  src: `/tracker-icon-${size}.png`,
  sizes: `${size}x${size}`,
  type: 'image/png',
}));

const notFound = () => new Response(null, { status: 404 });

/** The league's tracker addresses, or null for a value that cannot be a league's. */
function addressesOf(league: string): { readonly worker: string; readonly scope: string } | null {
  try {
    const worker = leagueUrl({ slug: league }, 'tracker-worker');
    return { worker, scope: trackerScopeOf(worker) };
  } catch {
    return null;
  }
}

/**
 * The web app manifest. Opened from the home screen, the app opens the game it was added
 * from (`game`, from the page's own link), within the league's tracker addresses.
 */
export function trackerManifestAnswer(league: string, game: string | null): Response {
  const at = addressesOf(league);
  if (at === null) return notFound();
  const start =
    game !== null && isGameIdFormat(game)
      ? { start_url: leagueUrl({ slug: league }, 'score', { game }) }
      : {};
  const manifest = {
    id: at.scope,
    name: t('tracker.app.name'),
    short_name: t('tracker.app.shortName'),
    scope: at.scope,
    ...start,
    display: 'standalone',
    background_color: trackerColour,
    theme_color: trackerColour,
    icons,
  };
  return new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'private, no-store' },
  });
}

/** The worker's script, for the league's tracker addresses only (its scope). */
export function trackerWorkerAnswer(league: string): Response {
  if (addressesOf(league) === null) return notFound();
  return new Response(trackerWorkerScript(), {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });
}

/** The tags the tracker's page puts in its head (React places them there). */
export function trackerHeadOf(
  league: { readonly slug: string },
  game: string,
): { readonly manifestHref: string; readonly workerHref: string; readonly colour: string } {
  const manifest = leagueUrl(league, 'tracker-manifest');
  return {
    manifestHref: `${manifest}?game=${encodeURIComponent(game)}`,
    workerHref: leagueUrl(league, 'tracker-worker'),
    colour: trackerColour,
  };
}
