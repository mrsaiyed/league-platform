// A scorekeeper's admin (P4 §4): "a scorekeeper who opens the admin sees a list of their
// games and nothing else", each with a button to the tracker, or, for a game recorded as
// a final score or a box score, how it is recorded and a link to enter its score. In
// game-night order (gameNightOrder), so tonight's game is on a phone's first screen. Which games are listed is
// games.list_my_games's own rule: in a league that scores assigned games only, only the
// games the scorekeeper is assigned to (P7 §5.1). Shown on the admin's home to anyone
// whose only area of the admin is Games; everyone else gets the admin's home as before.
// Above the list, the games this device still holds plays for (held-games-panel.tsx).
import { leagueUrl, listMyGames, platformUrl, type MyGame } from '@srleagues/core';
import { catalogs, displayLabels, en, finalPillOf } from '@srleagues/site';
import { EmptyPanel, GameCard, PageHead, type GameStatus } from '@srleagues/ui';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import { gameWhenText, type LeagueTimes } from '../../server/game-when.ts';
import type { LeagueView } from '../../server/league-gate.ts';
import { locale, t } from '../../server/messages.ts';
import { readReopenViews, ReopenLine } from '../games-area/index.ts';
import { heldGameMark, heldGamesPrefix } from './held-games.ts';
import { HeldGamesPanel } from './held-games-panel.tsx';
import {
  entersScoreInGames,
  gameNightOrder,
  notScoredBecause,
  opensInTracker,
} from './my-games.ts';

const statuses: readonly GameStatus[] = [
  'scheduled',
  'live',
  'final',
  'forfeit',
  'postponed',
  'cancelled',
];
const statusOf = (status: string): GameStatus => statuses.find((s) => s === status) ?? 'scheduled';

/** The scorekeeper's games, for a page that has already checked the admin is open to them. */
export async function MyGamesPage({ view }: { readonly view: LeagueView }) {
  const here = view.context.league;
  const ports = await webPorts();
  const listed = await listMyGames(commandContextOf(view.context), {}, ports.games.deps);
  const games = gameNightOrder(listed.ok ? listed.value.games : []);
  const stopped = notScoredBecause(here.status);
  const names = (await ports.games.namesOf(here.id)).teams;
  // A finished game says how it is put right, or who can (step 2.154).
  const context = commandContextOf(view.context);
  const reopens =
    stopped === null
      ? await readReopenViews(games, context, await ports.accessOf(context), ports.games.deps)
      : new Map<string, never>();
  const { timeZone } = await ports.publicSchedule.clockOf(here.id);
  const times: LeagueTimes = { locale, timeZone };
  const labels = displayLabels(t).game;
  // A game recorded as a final score or a box score says so, and where its score is
  // entered: the games area's form, or the game's box score.
  const entersScoreIn = (game: MyGame) => {
    const recording = entersScoreInGames(game);
    if (recording === null) return null;
    const href =
      recording === 'box-score'
        ? leagueUrl(here, 'admin-area', { area: 'games', subpath: [game.id] })
        : leagueUrl(here, 'admin-area', { area: 'games' });
    return (
      <p data-recording={recording}>
        {t(`admin.myGames.recording.${recording}`)}{' '}
        <a className="ui-button" href={href}>
          {t('admin.myGames.enterScore')}
        </a>
      </p>
    );
  };
  return (
    <main className="admin-my-games ui-stack">
      <PageHead title={t('admin.myGames.title')} sub={t('admin.myGames.intro')} />
      {stopped !== null ? (
        <p className="ui-notice" role="status">
          {t(`admin.myGames.${stopped}`)}
        </p>
      ) : games.some((g) => !g.scorable) ? (
        <p className="ui-notice">{t('admin.games.notScorable')}</p>
      ) : null}
      {/* Plays this device still holds for any game, however old (step 2.38; S-88). */}
      <HeldGamesPanel
        leagueId={here.id}
        scoreHref={leagueUrl(here, 'score', { game: heldGameMark })}
        locale={locale}
        catalog={Object.fromEntries(
          Object.entries(catalogs[locale] ?? en).filter(([key]) => key.startsWith(heldGamesPrefix)),
        )}
      />
      {!listed.ok ? (
        <p className="ui-notice" data-kind="error" role="alert">
          {t('admin.games.listProblem')}
        </p>
      ) : games.length === 0 ? (
        <EmptyPanel text={t('admin.myGames.empty')} />
      ) : (
        <ul className="ui-card-grid" data-my-games="">
          {games.map((game) => (
            <li key={game.id} data-game={game.id} data-today={game.isToday ? '' : undefined}>
              <div className="admin-game-panel admin-my-game">
                <GameCard
                  marks="emblem"
                  home={{ name: names[game.homeTeamId] ?? '', score: game.homeScore }}
                  away={{ name: names[game.awayTeamId] ?? '', score: game.awayScore }}
                  status={statusOf(game.status)}
                  finalPill={finalPillOf(t, game.overtimePeriods)}
                  whenText={gameWhenText(game.startsAt, times, { today: game.isToday })}
                  labels={labels}
                />
                {opensInTracker(game) ? (
                  <p>
                    <a
                      className="ui-button"
                      data-kind="main"
                      href={leagueUrl(here, 'score', { game: game.id })}
                    >
                      {t('admin.myGames.score')}
                    </a>
                  </p>
                ) : null}
                {entersScoreIn(game)}
                <ReopenLine
                  view={reopens.get(game.id)}
                  href={leagueUrl(here, 'admin-area', { area: 'games', subpath: [game.id] })}
                  times={times}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="admin-my-games-foot" data-shared-device="">
        {t('tracker.sharedDevice.text')}{' '}
        <a href={platformUrl('account')}>{t('tracker.sharedDevice.link')}</a>
      </p>
    </main>
  );
}
