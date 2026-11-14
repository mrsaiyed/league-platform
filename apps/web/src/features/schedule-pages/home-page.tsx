import { leagueUrl, readStandings } from '@srleagues/core';
import { StandingsTable } from '@srleagues/ui';
import { displayLabels } from '@srleagues/site';
import { notFound } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import {
  buildStandingsViews,
  chooseSeason,
  firstValue,
  SeasonChoice,
  type SearchParams,
  type StandingsTableView,
} from '../stats-pages/index.ts';
import { buildHomeGames } from './build-schedule.ts';
import { GameList } from './schedule-views.tsx';

/** The columns the home page's compact standings keep. */
const compactColumns: readonly string[] = ['played', 'wins', 'losses', 'winPercentage'];

/** A division's table cut down to the few columns that fit beside the games. */
export function compactStandings(table: StandingsTableView): StandingsTableView {
  const kept = new Set(compactColumns);
  return { ...table, columns: table.columns.filter((c) => kept.has(c.key)) };
}

/** `/{league}`: recent results, upcoming games and compact standings of one season. */
export async function HomePage({
  league,
  search,
}: {
  /** The route's `[league]` value. */
  readonly league: string;
  readonly search: SearchParams;
}) {
  const view = await loadLeaguePage(league, 'site');
  const addressee = view.context.league;
  const { publicStats, publicSchedule } = await webPorts();
  const seasons = await publicStats.seasonsOf(addressee.id);
  const asked = firstValue(search['season']);
  const season = chooseSeason(seasons, asked);
  if (season === undefined && asked !== undefined && asked !== '') return notFound();
  if (season === undefined) {
    return (
      <main>
        <h1>{t('nav.home')}</h1>
        <p>{t('home.noSeason')}</p>
      </main>
    );
  }
  const clock = await publicSchedule.clockOf(addressee.id);
  const schedule = await publicSchedule.scheduleOf(addressee.id, season.id, clock.today);
  if (schedule === undefined) return notFound();
  const standings = await readStandings(publicStats.readStoreOf(addressee.id), {
    seasonId: season.id,
  });
  const tables = standings.ok ? buildStandingsViews(standings.value) : [];
  const games = buildHomeGames(schedule, clock, addressee);
  const labels = displayLabels(t);
  const askedSeason = asked === undefined || asked === '' ? undefined : asked;
  const hasStandings = tables.some((table) => table.rows.length > 0);
  const empty = games.recent.length === 0 && games.upcoming.length === 0;
  return (
    <main>
      <h1>{t('nav.home')}</h1>
      <SeasonChoice seasons={seasons} chosen={season} action={leagueUrl(addressee, 'home')} />
      <p>{season.name}</p>
      {empty ? <p>{t('home.noGames')}</p> : null}
      <section>
        <h2>{t('home.recentResults')}</h2>
        {games.recent.length === 0 ? (
          <p>{t('home.noResults')}</p>
        ) : (
          <GameList leagueId={addressee.id} games={games.recent} />
        )}
      </section>
      <section>
        <h2>{t('home.upcoming')}</h2>
        {games.upcoming.length === 0 ? (
          <p>{t('home.noUpcoming')}</p>
        ) : (
          <GameList leagueId={addressee.id} games={games.upcoming} />
        )}
        <p>
          <a href={leagueUrl(addressee, 'schedule', { season: askedSeason })}>
            {t('home.fullSchedule')}
          </a>
        </p>
      </section>
      <section>
        <h2>{t('home.standings')}</h2>
        {hasStandings ? (
          tables.map((raw) => {
            const table = compactStandings(raw);
            return (
              <StandingsTable
                key={table.key}
                caption={table.caption}
                idPrefix={`home-${table.key}`}
                columns={table.columns}
                rows={table.rows}
                footnotes={table.footnotes}
                labels={labels.standings}
              />
            );
          })
        ) : (
          <p>{t('home.standingsEmpty')}</p>
        )}
        <p>
          <a href={leagueUrl(addressee, 'standings', { season: askedSeason })}>
            {t('home.fullStandings')}
          </a>
        </p>
      </section>
    </main>
  );
}
