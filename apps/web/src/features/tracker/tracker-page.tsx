// `/{league}/score/{game}`: the courtside tracker for one game (P2 §4, P7 §5.1), for a
// signed-in account allowed to score that game, in place of the Al-Hadi tracker's shared
// passcode (T6 §2). Two checks, both on the server before anything is drawn:
//
// - the league's own (league-gate.ts): someone who scores nowhere in this league, a
//   visitor or another league's admin included, sees "you do not have access" (U-6);
// - the game's: the staff read of its rosters (games.read_tracker_rosters, T-258) runs
//   only for whoever may score this game (mayScoreGame, read fresh, T-75), so a
//   scorekeeper limited to assigned games is refused one not theirs the same way. A
//   game that is not this league's is "not found".
//
// Only a game recorded live is scored here: one recorded as a final score or a box score
// is shown a message saying so, and nothing of it goes to the device.
//
// The rosters go to the device with the page and are stored there under the signed-in
// account, so the device can let go of another account's games (T-115); the device
// then takes the scoring session and loads the state itself (tracker-opening.tsx).
import { catalogs, en } from '@srleagues/site';
import { leagueUrl, platformUrl, readTrackerRosters } from '@srleagues/core';
import { forbidden, notFound } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import { isGameIdFormat } from '../../server/league-api.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { locale, t, type TextKey } from '../../server/messages.ts';
import { deviceRosters } from './device-rosters.ts';
import { scoresOnly } from './my-games.ts';
import { trackerCatalog } from './tracker-catalog.ts';
import { TrackerOpening } from './tracker-opening.tsx';

export async function TrackerPage({
  league,
  game,
}: {
  /** The route's `[league]` value. */
  readonly league: string;
  /** The route's game value: the game's id. */
  readonly game: string;
}) {
  const view = await loadLeaguePage(league, 'score');
  const here = view.context.league;
  if (!isGameIdFormat(game)) return notFound();
  const ports = await webPorts();
  const context = commandContextOf(view.context);
  const read = await readTrackerRosters(context, { gameId: game }, ports.games.deps);
  if (!read.ok) return read.error.code === 'not-allowed' ? forbidden() : notFound();
  // Only a signed-in account may score, so the read above already refused a visitor.
  if (context.accountId === null) return forbidden();
  const backHref = scoresOnly(view.areas)
    ? leagueUrl(here, 'admin')
    : leagueUrl(here, 'admin-area', { area: 'games' });
  if (read.value.recording !== 'live') {
    return <TrackerRefusal message="tracker.notLive" backHref={backHref} />;
  }
  const names = await ports.games.namesOf(here.id);
  return (
    <TrackerOpening
      leagueId={here.id}
      accountId={context.accountId}
      gameId={read.value.gameId}
      rosters={deviceRosters(read.value, names.teams)}
      backHref={backHref}
      accountHref={platformUrl('account')}
      locale={locale}
      catalog={trackerCatalog(catalogs[locale] ?? en)}
    />
  );
}

/** The tracker's page when the game is not opened on the device: why, and the way back. */
function TrackerRefusal({
  message,
  backHref,
}: {
  readonly message: TextKey;
  readonly backHref: string;
}) {
  return (
    <main className="score-root">
      <h1>{t('tracker.title')}</h1>
      <p role="alert">{t(message)}</p>
      <p>
        <a href={backHref}>{t('tracker.back')}</a>
      </p>
    </main>
  );
}
