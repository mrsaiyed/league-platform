import { leagueUrl } from '@srleagues/core';
import { EmptyPanel, FilterToolbar, OptionPicker, PageHead } from '@srleagues/ui';
import { displayLabels } from '@srleagues/site';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { webPorts } from '../../server/container.ts';
import { seasonsOfLeague } from '../../server/league-seasons.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import { loadStatsPage, parseBy, type StatsPageData } from './build-stats.ts';
import { chooseSeason, firstValue } from './choose-season.ts';
import type { SearchParams } from './standings-page.tsx';
import { staffNumbersAddress } from '../staff-numbers/index.ts';
import { StaffStatsTables } from './staff-stats-tables.tsx';
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

/**
 * The tables, and the signed-in request for the players they leave out. A team whose
 * players' numbers are kept from the public, and that has totals to show, is named on the
 * page already: only then can someone see more, and only then does the page ask, after it
 * has arrived, as whoever is signed in here (step 2.46, T-95). A hidden team with nothing
 * recorded sets up no request, so the page tells a visitor nothing of it.
 */
export function StatsTablesPart({
  data,
  staffAddress,
  children,
}: {
  readonly data: Pick<StatsPageData, 'totalsNoteTeams'>;
  readonly staffAddress: string;
  readonly children: ReactNode;
}) {
  if (data.totalsNoteTeams.length === 0) return children;
  return <StaffStatsTables address={staffAddress}>{children}</StaffStatsTables>;
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
  const tables =
    data === undefined ? null : (
      <StatsTables
        data={data}
        scheduleHref={leagueUrl(addressee, 'schedule', {
          season: asked === undefined || asked === '' ? undefined : asked,
        })}
      />
    );
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
          <StatsTablesPart
            data={data}
            staffAddress={staffNumbersAddress(addressee, { page: 'stats', season: season.id, by })}
          >
            {tables}
          </StatsTablesPart>
        </>
      )}
    </main>
  );
}
