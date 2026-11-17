import { leagueUrl } from '@srleagues/core';
import { EmptyPanel, FilterToolbar, OptionPicker, PageHead } from '@srleagues/ui';
import { displayLabels } from '@srleagues/site';
import { notFound } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { seasonsOfLeague } from '../../server/league-seasons.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import { loadStatsPage, parseBy, type StatsPageData } from './build-stats.ts';
import { chooseSeason, firstValue } from './choose-season.ts';
import type { SearchParams } from './standings-page.tsx';
import { StatsTablesDrawn } from './stats-tables-drawn.tsx';
import { statsTablesView } from './stats-tables-view.ts';

/** The leaders, the full table of players and the teams' totals. Nothing here reads anything. */
export function StatsTables({
  data,
  scheduleHref,
}: {
  readonly data: StatsPageData;
  /** Where "See the full schedule" goes while no numbers have been recorded. */
  readonly scheduleHref?: string;
}) {
  return <StatsTablesDrawn view={statsTablesView(data, scheduleHref)} />;
}

/** `/{league}/stats`: leaders with the league's minimum games and the full sortable tables, following each team's statistics setting. */
export async function StatsPage({
  league,
  search,
}: {
  /** The route's `[league]` value. */
  readonly league: string;
  readonly search: SearchParams;
}) {
  const view = await loadLeaguePage(league, 'site');
  const addressee = view.context.league;
  const { publicStats } = await webPorts();
  const seasons = await seasonsOfLeague(addressee.id);
  const asked = firstValue(search['season']);
  const season = chooseSeason(seasons, asked);
  if (season === undefined && asked !== undefined && asked !== '') return notFound();
  const by = parseBy(firstValue(search['by']));
  const data =
    season === undefined
      ? undefined
      : // The statistics and the league's name settings, as one snapshot (T-81).
        await publicStats.statisticsOf(addressee.id, ({ store, settings }) =>
          loadStatsPage(store, settings, { leagueId: addressee.id, seasonId: season.id, by }),
        );
  if (data !== undefined && 'code' in data) return notFound();
  const labels = displayLabels(t);
  const action = leagueUrl(addressee, 'stats');
  return (
    <main>
      <PageHead title={t('stats.heading')} kicker={season?.name} sub={t('stats.lead')} />
      {season === undefined || data === undefined ? (
        <EmptyPanel text={t('stats.noSeason')} />
      ) : (
        <>
          <FilterToolbar label={labels.filters}>
            <OptionPicker
              name="by"
              label={t('stats.showBy')}
              submitLabel={labels.show}
              action={action}
              value={by}
              options={[
                { value: 'average', label: t('stats.by.average') },
                { value: 'total', label: t('stats.by.total') },
              ]}
              keep={asked === undefined || asked === '' ? {} : { season: asked }}
            />
          </FilterToolbar>
          <StatsTables
            data={data}
            scheduleHref={leagueUrl(addressee, 'schedule', {
              season: asked === undefined || asked === '' ? undefined : asked,
            })}
          />
        </>
      )}
    </main>
  );
}
