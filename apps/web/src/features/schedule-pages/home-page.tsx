import { leagueUrl, readStandings } from '@srleagues/core';
import {
  EmptyPanel,
  FilterToolbar,
  PageHead,
  Section,
  StandingsTable,
  StatStrip,
} from '@srleagues/ui';
import { displayLabels } from '@srleagues/site';
import { notFound } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { siteOfLeague } from '../../server/league-site.ts';
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
import { buildHomeNumbers } from './build-home-numbers.ts';
import { buildHomeGames } from './build-schedule.ts';
import { GameList } from './schedule-views.tsx';

/** The columns the home page's compact standings keep. */
const compactColumns: readonly string[] = ['played', 'wins', 'losses', 'winPercentage'];

/** A division's table cut down to the few columns that fit beside the games. */
export function compactStandings(table: StandingsTableView): StandingsTableView {
  const kept = new Set(compactColumns);
  return { ...table, columns: table.columns.filter((c) => kept.has(c.key)) };
}

/**
 * `/{league}`: the league's name and season, the season in four numbers, a live game under
 * its own heading, then recent results and upcoming games with the compact standings beside
 * them on a laptop and beneath them on a phone.
 */
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
  const name = siteOfLeague(addressee).name;
  const { publicStats, publicSchedule } = await webPorts();
  const seasons = await publicStats.seasonsOf(addressee.id);
  const asked = firstValue(search['season']);
  const season = chooseSeason(seasons, asked);
  if (season === undefined && asked !== undefined && asked !== '') return notFound();
  if (season === undefined) {
    return (
      <main>
        <PageHead size="hero" title={name} />
        <EmptyPanel text={t('home.noSeason')} />
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
  // A game being played now comes first, under its own heading.
  const live = games.upcoming.filter((game) => game.status === 'live');
  const coming = games.upcoming.filter((game) => game.status !== 'live');
  const teamCount = tables.reduce((sum, table) => sum + table.rows.length, 0);
  return (
    <main>
      <PageHead size="hero" title={name} eyebrow={season.name}>
        {seasons.length > 1 ? (
          <FilterToolbar label={labels.filters}>
            <SeasonChoice seasons={seasons} chosen={season} action={leagueUrl(addressee, 'home')} />
          </FilterToolbar>
        ) : null}
      </PageHead>
      <div className="home-numbers">
        <StatStrip label={t('home.numbers')} items={buildHomeNumbers(schedule, teamCount)} />
      </div>
      {empty ? (
        <Section title={t('home.recentResults')}>
          <EmptyPanel text={t('home.noGames')} />
        </Section>
      ) : null}
      {live.length > 0 ? (
        <Section title={t('home.liveNow')}>
          <GameList leagueId={addressee.id} games={live} />
        </Section>
      ) : null}
      <div className="home-layout">
        <div>
          {empty ? null : (
            <Section title={t('home.recentResults')}>
              {games.recent.length === 0 ? (
                <EmptyPanel text={t('home.noResults')} />
              ) : (
                <GameList leagueId={addressee.id} games={games.recent} />
              )}
            </Section>
          )}
          <Section
            title={t('home.upcoming')}
            more={{
              href: leagueUrl(addressee, 'schedule', { season: askedSeason }),
              label: t('home.fullSchedule'),
            }}
          >
            {coming.length === 0 ? (
              <EmptyPanel text={t('home.noUpcoming')} />
            ) : (
              <GameList leagueId={addressee.id} games={coming} />
            )}
          </Section>
        </div>
        <Section
          title={t('home.standings')}
          more={{
            href: leagueUrl(addressee, 'standings', { season: askedSeason }),
            label: t('home.fullStandings'),
          }}
        >
          {hasStandings ? (
            <div className="ui-stack">
              {tables.map((raw) => {
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
              })}
            </div>
          ) : (
            <EmptyPanel text={t('home.standingsEmpty')} />
          )}
        </Section>
      </div>
    </main>
  );
}
