import { leagueUrl } from '@srleagues/core';
import { OptionPicker, SortableStatsTable } from '@srleagues/ui';
import { displayLabels } from '@srleagues/site';
import { notFound } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { locale, t } from '../../server/messages.ts';
import { loadStatsPage, parseBy, type StatsPageData } from './build-stats.ts';
import { chooseSeason, firstValue } from './choose-season.ts';
import { SeasonChoice, type SearchParams } from './standings-page.tsx';

/** The leaders, the full table of players and the teams' totals. Nothing here reads anything. */
export function StatsTables({ data }: { readonly data: StatsPageData }) {
  const labels = displayLabels(t);
  const hasLeaders = data.leaders.some((board) => board.rows.length > 0);
  const hasNumbers =
    data.playerRows.length > 0 ||
    data.teamRows.some((row) =>
      Object.entries(row.cells).some(([key, value]) => key !== 'team' && value !== null),
    );
  if (!hasNumbers) return <p>{t('stats.empty')}</p>;
  return (
    <>
      <section>
        <h2>{t('stats.leaders')}</h2>
        {data.minimumGames > 0 ? <p>{t.plural('stats.minimumGames', data.minimumGames)}</p> : null}
        {hasLeaders ? (
          data.leaders
            .filter((board) => board.rows.length > 0)
            .map((board) => (
              <SortableStatsTable
                key={board.key}
                caption={board.title}
                columns={board.columns}
                rows={board.rows}
                locale={locale}
                labels={labels.stats}
              />
            ))
        ) : (
          <p>{t('stats.leadersNone')}</p>
        )}
      </section>
      <section>
        <h2>{t('stats.allPlayers')}</h2>
        <SortableStatsTable
          caption={t('stats.allPlayers')}
          columns={data.playerColumns}
          rows={data.playerRows}
          locale={locale}
          labels={labels.stats}
        />
      </section>
      <section>
        <h2>{t('stats.teams')}</h2>
        <SortableStatsTable
          caption={t('stats.teams')}
          columns={data.teamColumns}
          rows={data.teamRows}
          locale={locale}
          labels={labels.stats}
        />
        {data.totalsOnlyTeams.length > 0 ? (
          <p>
            {t('stats.teamsTotalsOnly', {
              teams: data.totalsOnlyTeams.join(t('stats.teamsJoin')),
            })}
          </p>
        ) : null}
      </section>
    </>
  );
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
  const seasons = await publicStats.seasonsOf(addressee.id);
  const asked = firstValue(search['season']);
  const season = chooseSeason(seasons, asked);
  if (season === undefined && asked !== undefined && asked !== '') return notFound();
  const by = parseBy(firstValue(search['by']));
  const data =
    season === undefined
      ? undefined
      : await loadStatsPage(
          publicStats.readStoreOf(addressee.id),
          await publicStats.settingsOf(addressee.id),
          { leagueId: addressee.id, seasonId: season.id, by },
        );
  if (data !== undefined && 'code' in data) return notFound();
  const labels = displayLabels(t);
  const action = leagueUrl(addressee, 'stats');
  return (
    <main>
      <h1>{t('stats.title')}</h1>
      {season === undefined || data === undefined ? (
        <p>{t('stats.noSeason')}</p>
      ) : (
        <>
          <SeasonChoice seasons={seasons} chosen={season} action={action} keep={{ by }} />
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
          <p>{season.name}</p>
          <StatsTables data={data} />
        </>
      )}
    </main>
  );
}
