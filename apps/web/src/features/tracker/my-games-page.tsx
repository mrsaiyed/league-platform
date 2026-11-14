// A scorekeeper's admin (P4 §4): "a scorekeeper who opens the admin sees a list of their
// games and nothing else", each with a button to the tracker. Which games are listed is
// games.list_my_games's own rule: in a league that scores assigned games only, only the
// games the scorekeeper is assigned to (P7 §5.1). Shown on the admin's home to anyone
// whose only area of the admin is Games; everyone else gets the admin's home as before.
import { leagueUrl, listMyGames } from '@srleagues/core';
import { displayLabels } from '@srleagues/site';
import { GameCard, type GameStatus } from '@srleagues/ui';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import type { LeagueView } from '../../server/league-gate.ts';
import { t } from '../../server/messages.ts';
import { opensInTracker } from './my-games.ts';

const statuses: readonly GameStatus[] = [
  'scheduled',
  'live',
  'final',
  'forfeit',
  'postponed',
  'cancelled',
];
const statusOf = (status: string): GameStatus => statuses.find((s) => s === status) ?? 'scheduled';

const dayFormat = new Intl.DateTimeFormat('en', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const timeFormat = new Intl.DateTimeFormat('en', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
});

function whenText(startsAt: string | null): string {
  if (startsAt === null) return t('admin.games.noTime');
  const when = new Date(startsAt);
  return t('admin.games.when', { day: dayFormat.format(when), time: timeFormat.format(when) });
}

/** The scorekeeper's games, for a page that has already checked the admin is open to them. */
export async function MyGamesPage({ view }: { readonly view: LeagueView }) {
  const here = view.context.league;
  const ports = await webPorts();
  const listed = await listMyGames(commandContextOf(view.context), {}, ports.games.deps);
  const games = listed.ok ? listed.value.games : [];
  const names = (await ports.games.namesOf(here.id)).teams;
  const labels = displayLabels(t).game;
  return (
    <main className="admin-games">
      <h1>{t('admin.myGames.title')}</h1>
      <p>{t('admin.myGames.intro')}</p>
      {games.some((g) => !g.scorable) ? <p>{t('admin.games.notScorable')}</p> : null}
      {!listed.ok ? (
        <p role="alert">{t('admin.games.listProblem')}</p>
      ) : games.length === 0 ? (
        <p>{t('admin.myGames.empty')}</p>
      ) : (
        <ul className="admin-game-list" data-my-games="">
          {games.map((game) => (
            <li key={game.id} data-game={game.id}>
              <GameCard
                home={{ name: names[game.homeTeamId] ?? '', score: game.homeScore }}
                away={{ name: names[game.awayTeamId] ?? '', score: game.awayScore }}
                status={statusOf(game.status)}
                whenText={whenText(game.startsAt)}
                labels={labels}
              />
              {opensInTracker(game) ? (
                <p>
                  <a href={leagueUrl(here, 'score', { game: game.id })}>
                    {t('admin.myGames.score')}
                  </a>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
