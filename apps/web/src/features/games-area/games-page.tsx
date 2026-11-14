import { leagueUrl, listMyGames } from '@srleagues/core';
import { displayLabels } from '@srleagues/site';
import { GameCard } from '@srleagues/ui';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import { gameWhenText, type LeagueTimes } from '../../server/game-when.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { locale, t, type TextKey } from '../../server/messages.ts';
import {
  cancelGameAction,
  enterFinalScoreAction,
  postponeGameAction,
  recordForfeitAction,
} from './actions.ts';
import { buildGameRows, type GameRowView } from './build-games-view.ts';
import { isGameAction } from './run-game-action.ts';

export type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;

/** The notice after a change, as words: what was done, or why it was refused. */
export function noticeKey(search: SearchParams): { key: TextKey; problem: boolean } | undefined {
  const done = first(search['done']);
  if (isGameAction(done)) return { key: `admin.games.done.${done}`, problem: false };
  const problem = first(search['problem']);
  if (problem === undefined) return undefined;
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
    'admin.games.error.game-not-postponable',
    'admin.games.error.game-not-cancellable',
  ];
  return { key: known.find((k) => k === key) ?? 'admin.games.error.unknown', problem: true };
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

function Controls({
  league,
  game,
  trackerHref,
  boxScoreHref,
}: {
  readonly league: string;
  readonly game: GameRowView;
  readonly trackerHref: string;
  readonly boxScoreHref: string;
}) {
  return (
    <div className="admin-game-controls">
      {game.canScore ? (
        <form action={enterFinalScoreAction}>
          <Fields league={league} game={game} />
          {(['awayScore', 'homeScore'] as const).map((name) => (
            <label key={name}>
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
              />
            </label>
          ))}
          <button type="submit">{t('admin.games.saveScore')}</button>
        </form>
      ) : null}
      {game.trackerLink ? <a href={trackerHref}>{t('admin.games.openTracker')}</a> : null}
      {game.boxScoreLink ? <a href={boxScoreHref}>{t('admin.games.boxScore')}</a> : null}
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
  const rows = buildGameRows(games, await ports.games.namesOf(addressee.id), holder);
  const { timeZone } = await ports.publicSchedule.clockOf(addressee.id);
  const times: LeagueTimes = { locale, timeZone };
  const labels = displayLabels(t).game;
  const notice = noticeKey(search);
  return (
    <main className="admin-games">
      <h1>{t('admin.area.games')}</h1>
      <p>{t('admin.games.intro')}</p>
      {notice === undefined ? null : (
        <p role={notice.problem ? 'alert' : 'status'}>{t(notice.key)}</p>
      )}
      {games.some((g) => !g.scorable) ? <p>{t('admin.games.notScorable')}</p> : null}
      {!listed.ok ? (
        <p role="alert">{t('admin.games.listProblem')}</p>
      ) : rows.length === 0 ? (
        <p>{t('admin.games.empty')}</p>
      ) : (
        <ul className="admin-game-list">
          {rows.map((game) => (
            <li key={game.id}>
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
                game={game}
                trackerHref={leagueUrl(addressee, 'score', { game: game.id })}
                boxScoreHref={leagueUrl(addressee, 'admin-area', {
                  area: 'games',
                  subpath: [game.id],
                })}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
