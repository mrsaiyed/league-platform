// `/{league}/admin/games`: this week's games, and the changes this person may make to
// each (steps 2.55, 2.154 and 2.155). Every form here is answered without the address
// (T-271, record 067): a refusal or the question before a final score is saved in the
// response to the post, beside the game (final-score-boxes.tsx, action-form.tsx); a save
// by the one-time notice, read here once, which names the game and is said beside it.
import { leagueUrl, listMyGames, type LeagueAddressee } from '@srleagues/core';
import { displayLabels } from '@srleagues/site';
import { GameCard } from '@srleagues/ui';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import { gameWhenText, type LeagueTimes } from '../../server/game-when.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { locale, t, type TextKey } from '../../server/messages.ts';
import type { LeagueClock } from '../../server/public-schedule.ts';
import { noticeHolderOf, savedNoticesHere, type SavedNotice } from '../../server/saved-notice.ts';
import { ActionForm } from './action-form.tsx';
import {
  cancelGameAction,
  finalScoreAction,
  postponeGameAction,
  recordForfeitAction,
} from './actions.ts';
import { buildGameRows, type GameRowView } from './build-games-view.ts';
import { earlyWhen } from './early-when.ts';
import { FinalScoreBoxes, type FinalScoreTexts } from './final-score-boxes.tsx';
import { readReopenViews } from './read-reopen-views.ts';
import { ReopenLine } from './reopen-line.tsx';
import { SavedLine } from './saved-line.tsx';
import { gameAnchor } from './score-fields.ts';

/** "Tigers 47, Lions 51": both teams and the score, away team first, as on the card. */
function resultText(game: GameRowView, homeScore: number | string, awayScore: number | string) {
  return t('admin.games.result', {
    away: game.awayName,
    awayScore: String(awayScore),
    home: game.homeName,
    homeScore: String(homeScore),
  });
}

/** "Tigers at Lions". */
const gameText = (game: GameRowView) =>
  t('admin.games.game', { away: game.awayName, home: game.homeName });

const savedKeys = ['forfeit', 'postpone', 'cancel'] as const;

/**
 * What was just saved, as words, naming the game, read from the game as it is now: a
 * final score names its score too ("Saved: Tigers 47, Lions 51 is final.").
 */
function noticeText(notice: SavedNotice, game: GameRowView | undefined): string {
  const said = notice.said;
  if (said === 'reopen') {
    return t(
      game?.hasPlays === true ? 'admin.games.done.reopenTracked' : 'admin.games.done.reopen',
    );
  }
  if (game === undefined) {
    const doneKeys: readonly TextKey[] = [
      'admin.games.done.final',
      'admin.games.done.forfeit',
      'admin.games.done.postpone',
      'admin.games.done.cancel',
    ];
    return t(doneKeys.find((k) => k === `admin.games.done.${said}`) ?? 'admin.games.done.final');
  }
  if (said === 'final' && game.homeScore !== null && game.awayScore !== null) {
    return t('admin.games.saved.final', {
      result: resultText(game, game.homeScore, game.awayScore),
    });
  }
  const kind = savedKeys.find((k) => k === said);
  return kind === undefined
    ? t('admin.games.done.final')
    : t(`admin.games.saved.${kind}`, { game: gameText(game) });
}

/** The words of a game's score boxes and its question, for the client form. */
function finalScoreTexts(game: GameRowView, early: string | undefined): FinalScoreTexts {
  const result = resultText(game, '{homeScore}', '{awayScore}');
  const team = { awayScore: game.awayName, homeScore: game.homeName } as const;
  return {
    enterFinal: t('admin.games.enterFinal'),
    save: t('admin.games.saveScore'),
    labels: {
      awayScore: t('admin.games.scoreOf', { team: team.awayScore }),
      homeScore: t('admin.games.scoreOf', { team: team.homeScore }),
    },
    ask:
      early === undefined
        ? t('admin.games.confirm.ask', { result })
        : t('admin.games.confirm.early', { result, when: early }),
    yes: t('admin.games.confirm.yes'),
    no: t('admin.games.confirm.no'),
    wrongBox: {
      awayScore: t('admin.games.refused.score', { team: team.awayScore }),
      homeScore: t('admin.games.refused.score', { team: team.homeScore }),
    },
    tie: t('admin.games.refused.tie', { result }),
  };
}

/** A game's form's hidden values: which game as it was read, and the form's one-time token. */
function hiddenOf(league: string, game: GameRowView): Record<string, string> {
  return {
    league,
    gameId: game.id,
    version: String(game.version),
    requestToken: crypto.randomUUID(),
  };
}

function Controls({
  league,
  here,
  game,
  reopened,
  times,
  clock,
}: {
  readonly league: string;
  readonly here: LeagueAddressee;
  readonly game: GameRowView;
  /** The game was just reopened to correct it: its boxes start open. */
  readonly reopened: boolean;
  readonly times: LeagueTimes;
  /** The ports' clock, the one the games were read on: to say when a game's time has not come. */
  readonly clock: Pick<LeagueClock, 'now'>;
}) {
  const trackerHref = leagueUrl(here, 'score', { game: game.id });
  const gameHref = leagueUrl(here, 'admin-area', { area: 'games', subpath: [game.id] });
  const permalink = `${leagueUrl(here, 'admin-area', { area: 'games' })}#${gameAnchor(game.id)}`;
  // A refusal names the game ("Tigers at Lions: …").
  const refusal = t('admin.games.refusedAbout', { game: gameText(game), problem: '{problem}' });
  const early = earlyWhen(game.startsAt, clock, times);
  return (
    <div className="admin-game-controls ui-stack">
      {game.hasPlays ? (
        // Ended in the tracker (S-46): no score boxes and no forfeit.
        <>
          <p>{t('admin.games.tracked')}</p>
          {game.trackerLink ? (
            <p>
              <a className="ui-button" data-kind="main" href={trackerHref}>
                {t('admin.games.scoreGame')}
              </a>
            </p>
          ) : null}
        </>
      ) : null}
      {game.canScore ? (
        <FinalScoreBoxes
          action={finalScoreAction}
          league={league}
          gameId={game.id}
          version={game.version}
          token={crypto.randomUUID()}
          open={reopened}
          permalink={permalink}
          texts={finalScoreTexts(game, early)}
        />
      ) : null}
      {game.trackerLink && !game.hasPlays ? (
        <p>
          <a className="ui-button" href={trackerHref}>
            {t('admin.games.openTracker')}
          </a>
        </p>
      ) : null}
      {game.boxScoreLink ? (
        <p>
          <a className="ui-button" href={gameHref}>
            {t('admin.games.boxScore')}
          </a>
        </p>
      ) : null}
      <ReopenLine view={game.reopen} href={gameHref} times={times} />
      {game.canForfeit ? (
        <details>
          <summary>{t('admin.games.otherActions')}</summary>
          <ActionForm
            action={recordForfeitAction}
            permalink={permalink}
            hidden={hiddenOf(league, game)}
            choice={{
              name: 'forfeitingTeamId',
              label: t('admin.games.forfeitBy'),
              options: [
                { value: game.homeTeamId, label: game.homeName },
                { value: game.awayTeamId, label: game.awayName },
              ],
            }}
            button={t('admin.games.recordForfeit')}
            refusal={refusal}
          />
          {game.canCallOff ? (
            <>
              <ActionForm
                action={postponeGameAction}
                permalink={permalink}
                hidden={hiddenOf(league, game)}
                button={t('admin.games.postpone')}
                refusal={refusal}
              />
              <ActionForm
                action={cancelGameAction}
                permalink={permalink}
                hidden={hiddenOf(league, game)}
                button={t('admin.games.cancel')}
                refusal={refusal}
              />
            </>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}

/** `/{league}/admin/games`: this week's games, and the changes this person may make to each. */
export async function GamesPage({
  league,
}: {
  /** The route's `[league]` value. */
  readonly league: string;
}) {
  const view = await loadLeaguePage(league, 'admin', 'games');
  const addressee = view.context.league;
  const ports = await webPorts();
  const context = commandContextOf(view.context);
  // Which games are listed is the command's own rule: a scorekeeper in a league that
  // scores assigned games only gets only theirs (P4 §4).
  const listed = await listMyGames(context, {}, ports.games.deps);
  const games = listed.ok ? listed.value.games : [];
  const holder = await ports.accessOf(context);
  const reopens = await readReopenViews(games, context, holder, ports.games.deps);
  const rows = buildGameRows(games, await ports.games.namesOf(addressee.id), holder, reopens);
  // The ports' one clock (step 2.179): the made-up world's own on the stand-in, so a game's
  // time is never measured against another clock than the one it was read on.
  const clock = await ports.publicSchedule.clockOf(addressee.id);
  const times: LeagueTimes = { locale, timeZone: clock.timeZone };
  const labels = displayLabels(t).game;
  // What was just saved, taken (so a reload does not say it again): said beside its game;
  // at the top only when the game is not listed.
  const noticeHolder = noticeHolderOf(context);
  const notice =
    noticeHolder === undefined ? undefined : savedNoticesHere().take(noticeHolder, 'games');
  const aboutRow = rows.find((row) => row.id === notice?.thing);
  const saved = notice === undefined ? undefined : noticeText(notice, aboutRow);
  return (
    <main className="admin-games">
      <h1>{t('admin.area.games')}</h1>
      <p>{t('admin.games.intro')}</p>
      {saved === undefined || aboutRow !== undefined ? null : <SavedLine text={saved} />}
      {games.some((g) => !g.scorable) ? <p>{t('admin.games.notScorable')}</p> : null}
      {!listed.ok ? (
        <p role="alert">{t('admin.games.listProblem')}</p>
      ) : rows.length === 0 ? (
        <p>{t('admin.games.empty')}</p>
      ) : (
        <ul className="admin-game-list ui-list">
          {rows.map((game) => (
            <li key={game.id} id={gameAnchor(game.id)} className="ui-stack">
              <div className="ui-stack">
                {saved !== undefined && game === aboutRow ? <SavedLine text={saved} /> : null}
                <GameCard
                  home={{ name: game.homeName, score: game.homeScore }}
                  away={{ name: game.awayName, score: game.awayScore }}
                  status={game.status}
                  whenText={gameWhenText(game.startsAt, times)}
                  {...(game.status === 'final' || game.status === 'forfeit'
                    ? { detailsHref: leagueUrl(addressee, 'game', { game: game.id }) }
                    : {})}
                  labels={labels}
                />
                <p>
                  {game.scorekeepers.length === 0
                    ? t('admin.games.noScorekeeper')
                    : t('admin.games.scorekeeper', { names: game.scorekeepers.join(', ') })}
                </p>
                <Controls
                  league={league}
                  here={addressee}
                  game={game}
                  reopened={game === aboutRow && notice?.said === 'reopen'}
                  times={times}
                  clock={clock}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
