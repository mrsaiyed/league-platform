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
//   refusal, with the way back to their games. A game that is not this league's, another
//   league's among them, is "Page not found" with status 404 in the same look
//   (TrackerGameNotFound, app/[league]/score/[game]/not-found.tsx; step 2.157), and says
//   nothing of the other league.
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
//
// The tracker's address has no league frame around it (step 2.35; the league's layout
// leaves it off): the scoring screen has a frame and a look of its own, the same for
// every league (docs/build/DESIGN.md section 7; record 064). A refusal is still one of
// the league's own message pages, so it draws the league's look around itself here.
import { catalogs, en } from '@srleagues/site';
import { MessagePage } from '@srleagues/ui';
import { leagueUrl, listMyGames, platformUrl, readTrackerRosters } from '@srleagues/core';
import { forbidden, notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { AccountButton, accountMenuOf, DesignStyle } from '../shell/index.ts';
import { webPorts } from '../../server/container.ts';
import type { LeagueView } from '../../server/league-gate.ts';
import { commandContextOf } from '../../server/context.ts';
import { gameWhenText } from '../../server/game-when.ts';
import { isGameIdFormat } from '../../server/league-api.ts';
import { siteOfThisRequest } from '../../server/league-site.ts';
import { loadLeaguePage, signedInEmail } from '../../server/load-league-page.ts';
import { locale, t, type TextKey } from '../../server/messages.ts';
import { signInFirstUrl } from '../../server/sign-in-first.ts';
import { deviceRosters } from './device-rosters.ts';
import { trackerRostersReply } from '../../server/tracker-rosters-reply.ts';
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
  const refusal = (message: TextKey, enter?: { readonly href: string }) => (
    <LeagueLook league={here}>
      <TrackerRefusal
        message={message}
        backHref={backHref}
        {...(enter === undefined ? {} : { enter })}
      />
    </LeagueLook>
  );
  // Only someone who scores in this league is this far, so saying there is no such game
  // gives nothing away.
  if (!isGameIdFormat(game)) return notFound();
  // The league's gate let only someone who scores here this far; nothing of the game is read.
  const stopped = notScoredBecause(here.status);
  if (stopped !== null) return refusal(`admin.myGames.${stopped}`);
  const ports = await webPorts();
  const context = commandContextOf(view.context);
  const read = await readTrackerRosters(context, { gameId: game }, ports.games.deps);
  if (!read.ok) {
    if (read.error.code !== 'not-allowed') return notFound();
    return refusal('tracker.notAssigned');
  }
  // Only a signed-in account may score, so the read above already refused a visitor.
  if (context.accountId === null) return forbidden();
  if (read.value.recording !== 'live') {
    // A game still to be played or being played is scored in the games area; one over,
    // postponed or cancelled is not scored now at all.
    const open = read.value.status === 'scheduled' || read.value.status === 'live';
    if (!open) return refusal('tracker.readOnly.game-not-live');
    const boxScore = read.value.recording === 'box-score';
    return refusal(boxScore ? 'tracker.notLive.box-score' : 'tracker.notLive.final-score', {
      href: boxScore
        ? leagueUrl(here, 'admin-area', { area: 'games', subpath: [read.value.gameId] })
        : leagueUrl(here, 'admin-area', { area: 'games' }),
    });
  }
  const names = await ports.games.namesOf(here.id);
  const trackerHref = leagueUrl(here, 'score', { game: read.value.gameId });
  // The title says the game's day and time (checklist A3), in the league's time zone. The
  // scorekeeper's own list of games holds it; a game no longer on that list has none here.
  const listed = await listMyGames(context, {}, ports.games.deps);
  const mine = listed.ok ? listed.value.games.find((g) => g.id === read.value.gameId) : undefined;
  const { timeZone } = await ports.publicSchedule.clockOf(here.id);
  const when =
    mine === undefined || mine.startsAt === null
      ? null
      : gameWhenText(mine.startsAt, { locale, timeZone });
  // The account button of step 2.127, in the tracker's own frame (DESIGN.md section 7,
  // line 11): a shared tablet is signed out from here, leaving the game first.
  const menu = accountMenuOf(view, await signedInEmail(), trackerHref);
  return (
    <TrackerOpening
      leagueId={here.id}
      accountId={context.accountId}
      gameId={read.value.gameId}
      rosters={deviceRosters(trackerRostersReply(read.value), names.teams)}
      when={when}
      watchHref={leagueUrl(here, 'game', { game: read.value.gameId })}
      backHref={backHref}
      accountHref={platformUrl('account')}
      account={menu === null ? null : <AccountButton account={menu} />}
      signInHref={signInFirstUrl(trackerHref, { problem: 'signInAgain' })}
      // Whoever works in more areas than scoring may correct games: only the words of
      // the Mark not started question follow from it. The league stays the judge (S-40).
      mayCorrect={!scoresOnly(view.areas)}
      locale={locale}
      catalog={trackerCatalog(catalogs[locale] ?? en)}
    />
  );
}

/**
 * The league's look around one of the tracker's refusals: its design as CSS variables and
 * the page's body, with no header, menu or footer (the league's layout draws none at the
 * tracker's address). The scoring screen is never inside this.
 */
async function LeagueLook({
  league,
  children,
}: {
  readonly league: { readonly id: string; readonly slug: string };
  readonly children: ReactNode;
}) {
  const site = await siteOfThisRequest(league.id, league.slug);
  return (
    <div className="league-site ui-root">
      <DesignStyle design={site.design} />
      <div className="site-body" id="content">
        {children}
      </div>
    </div>
  );
}

/**
 * The tracker's page when the game is not opened on the device: the frame's message page
 * (DESIGN.md §4, line 19), saying why, with one clear way on. That is where its score is
 * entered when that is somewhere else, with the way back beside it; otherwise the way back.
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
  if (enter === undefined) {
    return (
      <MessagePage title={t('tracker.title')} action={{ href: backHref, label: t('tracker.back') }}>
        <p role="alert">{t(message)}</p>
      </MessagePage>
    );
  }
  // Two ways on: where the score is entered first (the main one), then the way back.
  return (
    <MessagePage title={t('tracker.title')}>
      <p role="alert">{t(message)}</p>
      <a className="ui-button" data-kind="main" href={enter.href}>
        {t('admin.myGames.enterScore')}
      </a>
      <a className="ui-button" href={backHref}>
        {t('tracker.back')}
      </a>
    </MessagePage>
  );
}

/**
 * "Page not found" at a game's scoring address, for someone who scores in this league
 * (step 2.157): a game that is not this league's (another league's included) or an
 * address that is no game's. It is the tracker's own refusal in the league's look, with
 * the way back to their games, answered with status 404 by Next.js. Nothing of any other
 * league is read or said.
 */
export async function TrackerGameNotFound({ view }: { readonly view: LeagueView }) {
  const here = view.context.league;
  const backHref = scoresOnly(view.areas)
    ? leagueUrl(here, 'admin')
    : leagueUrl(here, 'admin-area', { area: 'games' });
  const site = await siteOfThisRequest(here.id, here.slug);
  // In the league's look, centred on the screen in the same place as SR Leagues' own plain
  // "Page not found" (ui-standalone), with none of the page body's padding around it.
  return (
    <div className="league-site ui-root">
      <DesignStyle design={site.design} />
      <div className="ui-standalone">
        <MessagePage
          title={t('common.notFoundTitle')}
          action={{ href: backHref, label: t('tracker.back') }}
        >
          <p>{t('tracker.unknownGame')}</p>
        </MessagePage>
      </div>
    </div>
  );
}
