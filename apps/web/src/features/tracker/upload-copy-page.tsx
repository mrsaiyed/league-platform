// `/{league}/score/{game}/upload`: the upload of a copy of a game (step 2.70, S-5, T-129),
// on any phone or computer. The file "Save a copy" wrote on the scoring device is opened
// here and sent to the server through the tracker's own door, so nothing counts twice.
//
// Uploading needs what scoring needs (T-258), checked on the server before anything is
// drawn, exactly as the tracker's page checks it (tracker-page.tsx): the league's gate
// (someone signed in who scores nowhere here sees "you do not have access"; someone not
// signed in is sent to sign in and brought back), then the game's (mayScoreGame, read
// fresh), so a scorekeeper limited to assigned games is refused one not theirs. A game
// recorded as a final score or a box score has no plays to upload: it says where its
// score is entered. A final game recorded live is shown the form: its upload is answered
// "reopen it first" by the server (T-362), the one judge of the game's state.
//
// The page is not the tracker's own address (isTrackerAddress), so it sits in the
// league's frame like any page of the league, and the device's worker never keeps it.
import { catalogs, en } from '@srleagues/site';
import { MessagePage, PageHead } from '@srleagues/ui';
import { leagueUrl, readTrackerRosters } from '@srleagues/core';
import { forbidden, notFound } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import { isGameIdFormat } from '../../server/league-api.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { locale, t, type TextKey } from '../../server/messages.ts';
import { notScoredBecause, scoresOnly } from './my-games.ts';
import { trackerCatalog } from './tracker-catalog.ts';
import { UploadCopyForm } from './upload-copy-form.tsx';

export async function UploadCopyPage({
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
    <MessagePage title={t('tracker.upload.title')} className="upload-copy-refused">
      <p role="alert">{t(message)}</p>
      {enter === undefined ? null : (
        <a className="ui-button" data-kind="main" href={enter.href}>
          {t('admin.myGames.enterScore')}
        </a>
      )}
      <a className="ui-button" href={backHref}>
        {t('tracker.upload.back')}
      </a>
    </MessagePage>
  );
  if (!isGameIdFormat(game)) return notFound();
  const stopped = notScoredBecause(here.status);
  if (stopped !== null) return refusal(`admin.myGames.${stopped}`);
  const ports = await webPorts();
  const context = commandContextOf(view.context);
  const read = await readTrackerRosters(context, { gameId: game }, ports.games.deps);
  if (!read.ok) {
    if (read.error.code !== 'not-allowed') return notFound();
    return refusal('tracker.notAssigned');
  }
  if (context.accountId === null) return forbidden();
  if (read.value.recording !== 'live') {
    const boxScore = read.value.recording === 'box-score';
    return refusal(boxScore ? 'tracker.notLive.box-score' : 'tracker.notLive.final-score', {
      href: boxScore
        ? leagueUrl(here, 'admin-area', { area: 'games', subpath: [read.value.gameId] })
        : leagueUrl(here, 'admin-area', { area: 'games' }),
    });
  }
  const names = await ports.games.namesOf(here.id);
  const matchup = t('admin.games.game', {
    away: names.teams[read.value.awayTeamId] ?? '',
    home: names.teams[read.value.homeTeamId] ?? '',
  });
  return (
    <main className="ui-stack" data-upload-page={read.value.gameId}>
      <PageHead title={t('tracker.upload.title')} sub={matchup} />
      <p>{t('tracker.upload.intro')}</p>
      <UploadCopyForm
        leagueId={here.id}
        gameId={read.value.gameId}
        locale={locale}
        catalog={trackerCatalog(catalogs[locale] ?? en)}
      />
      <p>
        <a href={backHref}>{t('tracker.upload.back')}</a>
      </p>
    </main>
  );
}
