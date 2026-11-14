// `/{league}/score/{game}`: the courtside tracker for one game (P2 §4, P7 §5.1), for a
// signed-in account allowed to score that game, in place of the Al-Hadi tracker's shared
// passcode (T6 §2). Two checks, both on the server before anything is drawn:
//
// - the league's own (league-gate.ts): someone signed in who scores nowhere in this
//   league, another league's admin included, sees "you do not have access" (U-6).
//   Someone not signed in is sent to sign in and brought back to this game (step 2.33);
//   a league hidden from them is still "not found";
// - the game's: the staff read of its rosters (games.read_tracker_rosters, T-258) runs
//   only for whoever may score this game (mayScoreGame, read fresh, T-75), so a
//   scorekeeper limited to assigned games is refused one not theirs: the tracker's own
//   refusal, with the way back to their games. So is a game that is not this league's.
//
// In a league that is archived or suspended nothing is scored (U-9): the page says which,
// rather than "you do not have access".
//
// Only a game recorded live is scored here: one recorded as a final score or a box score
// is shown how it is recorded and where its score is entered, and nothing of it goes to
// the device.
//
// The rosters go to the device with the page and are stored there under the signed-in
// account, so the device can let go of another account's games (T-115); the device
// then takes the scoring session and loads the state itself (tracker-opening.tsx).
import { catalogs, en } from '@srleagues/site';
import { leagueUrl, platformUrl, readTrackerRosters } from '@srleagues/core';
import { forbidden } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import { isGameIdFormat } from '../../server/league-api.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { locale, t, type TextKey } from '../../server/messages.ts';
import { signInFirstUrl } from '../../server/sign-in-first.ts';
import { deviceRosters } from './device-rosters.ts';
import { notScoredBecause, scoresOnly } from './my-games.ts';
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
  const view = await loadLeaguePage(league, 'score', null, { problem: 'signInToScore' });
  const here = view.context.league;
  const backHref = scoresOnly(view.areas)
    ? leagueUrl(here, 'admin')
    : leagueUrl(here, 'admin-area', { area: 'games' });
  // Only someone who scores in this league is this far, so saying there is no such game
  // gives nothing away.
  if (!isGameIdFormat(game)) {
    return <TrackerRefusal message="tracker.unknownGame" backHref={backHref} />;
  }
  // The league's gate let only someone who scores here this far; nothing of the game is read.
  const stopped = notScoredBecause(here.status);
  if (stopped !== null) {
    return <TrackerRefusal message={`admin.myGames.${stopped}`} backHref={backHref} />;
  }
  const ports = await webPorts();
  const context = commandContextOf(view.context);
  const read = await readTrackerRosters(context, { gameId: game }, ports.games.deps);
  if (!read.ok) {
    return (
      <TrackerRefusal
        message={read.error.code === 'not-allowed' ? 'tracker.notAssigned' : 'tracker.unknownGame'}
        backHref={backHref}
      />
    );
  }
  // Only a signed-in account may score, so the read above already refused a visitor.
  if (context.accountId === null) return forbidden();
  if (read.value.recording !== 'live') {
    // A game still to be played or being played is scored in the games area; one over,
    // postponed or cancelled is not scored now at all.
    const open = read.value.status === 'scheduled' || read.value.status === 'live';
    if (!open) {
      return <TrackerRefusal message="tracker.readOnly.game-not-live" backHref={backHref} />;
    }
    const boxScore = read.value.recording === 'box-score';
    return (
      <TrackerRefusal
        message={boxScore ? 'tracker.notLive.box-score' : 'tracker.notLive.final-score'}
        backHref={backHref}
        enter={{
          href: boxScore
            ? leagueUrl(here, 'admin-area', { area: 'games', subpath: [read.value.gameId] })
            : leagueUrl(here, 'admin-area', { area: 'games' }),
        }}
      />
    );
  }
  const names = await ports.games.namesOf(here.id);
  const trackerHref = leagueUrl(here, 'score', { game: read.value.gameId });
  return (
    <TrackerOpening
      leagueId={here.id}
      accountId={context.accountId}
      gameId={read.value.gameId}
      rosters={deviceRosters(read.value, names.teams)}
      backHref={backHref}
      accountHref={platformUrl('account')}
      signInHref={signInFirstUrl(trackerHref, { problem: 'signInAgain' })}
      locale={locale}
      catalog={trackerCatalog(catalogs[locale] ?? en)}
    />
  );
}

/**
 * The tracker's page when the game is not opened on the device: why, where its score is
 * entered when that is somewhere else, and the way back.
 */
function TrackerRefusal({
  message,
  backHref,
  enter,
}: {
  readonly message: TextKey;
  readonly backHref: string;
  readonly enter?: { readonly href: string };
}) {
  return (
    <main className="score-root">
      <h1>{t('tracker.title')}</h1>
      <p role="alert">{t(message)}</p>
      {enter === undefined ? null : (
        <p>
          <a className="tap-button" href={enter.href}>
            {t('admin.myGames.enterScore')}
          </a>
        </p>
      )}
      <p>
        <a href={backHref}>{t('tracker.back')}</a>
      </p>
    </main>
  );
}
