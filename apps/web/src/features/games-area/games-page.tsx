import { leagueUrl, listMyGames, type LeagueAddressee } from '@srleagues/core';
import { displayLabels } from '@srleagues/site';
import { GameCard } from '@srleagues/ui';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import { gameWhenText, type LeagueTimes } from '../../server/game-when.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { locale, t, type TextKey } from '../../server/messages.ts';
import {
  askFinalScoreAction,
  cancelGameAction,
  enterFinalScoreAction,
  postponeGameAction,
  recordForfeitAction,
} from './actions.ts';
import { buildGameRows, type GameRowView } from './build-games-view.ts';
import {
  gameAnchor,
  gamesReturn,
  readGamesSearch,
  type GamesSearch,
  type SearchParams,
} from './games-search.ts';
import { readReopenViews } from './read-reopen-views.ts';
import { ReopenLine } from './reopen-line.tsx';

export type { SearchParams } from './games-search.ts';

/** A refusal, as words: the command's code where the list knows it. */
function problemKey(problem: string): TextKey {
  const key = `admin.games.error.${problem}`;
  const known: readonly TextKey[] = [
    'admin.games.error.not-allowed',
    'admin.games.error.invalid-input',
    'admin.games.error.game-not-found',
    'admin.games.error.changed-since-read',
    'admin.games.error.game-already-decided',
    'admin.games.error.game-cancelled',
    'admin.games.error.tie-not-allowed',
    'admin.games.error.team-not-in-game',
    'admin.games.error.game-is-tracked',
    'admin.games.error.game-not-postponable',
    'admin.games.error.game-not-cancellable',
  ];
  return known.find((k) => k === key) ?? 'admin.games.error.unknown';
}

/** "Tigers 47, Lions 51": both teams and the score, away team first, as on the card. */
function resultText(game: GameRowView, homeScore: number | string, awayScore: number | string) {
  return t('admin.games.result', {
    away: game.awayName,
    awayScore: String(awayScore),
    home: game.homeName,
    homeScore: String(homeScore),
  });
}

type Notice = { readonly text: string; readonly problem: boolean };

/**
 * What was just done or refused, as words. A saved final score names the game and its
 * score ("Saved: Tigers 47, Lions 51 is final."), read from the game as it is now.
 */
function noticeOf(search: GamesSearch, game: GameRowView | undefined): Notice | undefined {
  if (search.problem !== undefined) return { text: t(problemKey(search.problem)), problem: true };
  const done = search.done;
  if (done === undefined) return undefined;
  if (done === 'reopen') {
    return {
      text: t(
        game?.hasPlays === true ? 'admin.games.done.reopenTracked' : 'admin.games.done.reopen',
      ),
      problem: false,
    };
  }
  if (
    done === 'final' &&
    game?.status === 'final' &&
    game.homeScore !== null &&
    game.awayScore !== null
  ) {
    const result = resultText(game, game.homeScore, game.awayScore);
    return { text: t('admin.games.saved.final', { result }), problem: false };
  }
  return { text: t(`admin.games.done.${done}`), problem: false };
}

function NoticeLine({ notice }: { readonly notice: Notice }) {
  return notice.problem ? (
    <p className="ui-notice" data-kind="error" role="alert">
      {notice.text}
    </p>
  ) : (
    <p className="ui-notice" role="status">
      {notice.text}
    </p>
  );
}

function Fields({ league, game }: { readonly league: string; readonly game: GameRowView }) {
  return (
    <>
      <input type="hidden" name="league" value={league} />
      <input type="hidden" name="gameId" value={game.id} />
      <input type="hidden" name="version" value={game.version} />
    </>
  );
}

/**
 * The game's score boxes, behind "Enter the final score" on this game alone. Saving them
 * only asks (askFinalScoreAction). Open, with what was typed, when the person comes back
 * from the question to change the score, or after the game was reopened to correct it.
 */
function ScoreBoxes({
  league,
  game,
  enter,
}: {
  readonly league: string;
  readonly game: GameRowView;
  readonly enter: GamesSearch['enter'];
}) {
  const open = enter?.gameId === game.id;
  const typed = open ? enter.typed : undefined;
  return (
    <details open={open} data-score-boxes="">
      <summary className="ui-button">{t('admin.games.enterFinal')}</summary>
      <form action={askFinalScoreAction} className="ui-panel ui-stack">
        <Fields league={league} game={game} />
        {(['awayScore', 'homeScore'] as const).map((name) => (
          <label key={name} className="ui-stack">
            <span>
              {t('admin.games.scoreOf', {
                team: name === 'homeScore' ? game.homeName : game.awayName,
              })}
            </span>
            <input
              type="number"
              name={name}
              inputMode="numeric"
              min={0}
              max={999}
              step={1}
              required
              defaultValue={typed?.[name] ?? ''}
            />
          </label>
        ))}
        <p>
          <button type="submit" className="ui-button" data-kind="main">
            {t('admin.games.saveScore')}
          </button>
        </p>
      </form>
    </details>
  );
}

/**
 * The question before a final score is saved (A-5): both teams and the score, and first
 * that the game's time has not come when it has not. "Yes" is the one form that saves a
 * final score; "No" opens the boxes again with what was typed.
 */
function ScoreQuestion({
  league,
  here,
  game,
  ask,
  early,
}: {
  readonly league: string;
  readonly here: LeagueAddressee;
  readonly game: GameRowView;
  readonly ask: NonNullable<GamesSearch['ask']>;
  /** When the game is set for, written for the reader, when that time has not come. */
  readonly early: string | undefined;
}) {
  const result = resultText(game, ask.homeScore, ask.awayScore);
  const questionId = `${gameAnchor(game.id)}-question`;
  const change =
    leagueUrl(here, 'admin-area', { area: 'games' }) +
    gamesReturn({ enter: game.id, home: ask.homeScore, away: ask.awayScore }, game.id);
  return (
    <div className="ui-panel ui-stack" role="group" aria-labelledby={questionId} data-question="">
      <p id={questionId}>
        <strong>
          {early === undefined
            ? t('admin.games.confirm.ask', { result })
            : t('admin.games.confirm.early', { result, when: early })}
        </strong>
      </p>
      <form action={enterFinalScoreAction}>
        <input type="hidden" name="league" value={league} />
        <input type="hidden" name="gameId" value={game.id} />
        <input type="hidden" name="version" value={ask.version} />
        <input type="hidden" name="homeScore" value={ask.homeScore} />
        <input type="hidden" name="awayScore" value={ask.awayScore} />
        <input type="hidden" name="confirmed" value="yes" />
        <button type="submit" className="ui-button" data-kind="main">
          {t('admin.games.confirm.yes')}
        </button>
      </form>
      <p>
        <a className="ui-button" href={change}>
          {t('admin.games.confirm.no')}
        </a>
      </p>
    </div>
  );
}

function Controls({
  league,
  here,
  game,
  search,
  times,
  now,
}: {
  readonly league: string;
  readonly here: LeagueAddressee;
  readonly game: GameRowView;
  readonly search: GamesSearch;
  readonly times: LeagueTimes;
  /** The server's time now (ms), to say when a game's time has not come. */
  readonly now: number;
}) {
  const trackerHref = leagueUrl(here, 'score', { game: game.id });
  const gameHref = leagueUrl(here, 'admin-area', { area: 'games', subpath: [game.id] });
  const asking = game.canScore && search.ask?.gameId === game.id ? search.ask : undefined;
  const early =
    game.startsAt !== null && Date.parse(game.startsAt) > now
      ? gameWhenText(game.startsAt, times)
      : undefined;
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
      {asking !== undefined ? (
        <ScoreQuestion league={league} here={here} game={game} ask={asking} early={early} />
      ) : game.canScore ? (
        <ScoreBoxes league={league} game={game} enter={search.enter} />
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
          <form action={recordForfeitAction}>
            <Fields league={league} game={game} />
            <label>
              <span>{t('admin.games.forfeitBy')}</span>
              <select name="forfeitingTeamId" required>
                <option value={game.homeTeamId}>{game.homeName}</option>
                <option value={game.awayTeamId}>{game.awayName}</option>
              </select>
            </label>
            <button type="submit">{t('admin.games.recordForfeit')}</button>
          </form>
          {game.canCallOff ? (
            <>
              <form action={postponeGameAction}>
                <Fields league={league} game={game} />
                <button type="submit">{t('admin.games.postpone')}</button>
              </form>
              <form action={cancelGameAction}>
                <Fields league={league} game={game} />
                <button type="submit">{t('admin.games.cancel')}</button>
              </form>
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
  search,
}: {
  /** The route's `[league]` value. */
  readonly league: string;
  readonly search: SearchParams;
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
  const { timeZone } = await ports.publicSchedule.clockOf(addressee.id);
  const times: LeagueTimes = { locale, timeZone };
  const labels = displayLabels(t).game;
  const said = readGamesSearch(search);
  // The answer to a tap is said beside its game; at the top only when the game is not listed.
  const aboutRow = rows.find((row) => row.id === said.game);
  const notice = noticeOf(said, aboutRow);
  const now = Date.now();
  return (
    <main className="admin-games">
      <h1>{t('admin.area.games')}</h1>
      <p>{t('admin.games.intro')}</p>
      {notice === undefined || aboutRow !== undefined ? null : <NoticeLine notice={notice} />}
      {games.some((g) => !g.scorable) ? <p>{t('admin.games.notScorable')}</p> : null}
      {!listed.ok ? (
        <p role="alert">{t('admin.games.listProblem')}</p>
      ) : rows.length === 0 ? (
        <p>{t('admin.games.empty')}</p>
      ) : (
        <ul className="admin-game-list ui-card-grid">
          {rows.map((game) => (
            <li key={game.id} id={gameAnchor(game.id)}>
              <div className="ui-stack">
                {notice !== undefined && game === aboutRow ? <NoticeLine notice={notice} /> : null}
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
                  search={said}
                  times={times}
                  now={now}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
