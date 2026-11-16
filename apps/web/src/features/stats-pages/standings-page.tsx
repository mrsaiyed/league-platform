import { leagueUrl, type LeagueAddressee } from '@srleagues/core';
import { EmptyPanel, PageHead, StandingsTable } from '@srleagues/ui';
import { displayLabels } from '@srleagues/site';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { webPorts } from '../../server/container.ts';
import { seasonsOfLeague } from '../../server/league-seasons.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import { buildStandingsViews, type StandingsTableView } from './build-standings.ts';
import { chooseSeason, firstValue } from './choose-season.ts';

export type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

/** The tables of one season, as the page draws them. Nothing here reads anything. */
export function StandingsTables({
  tables,
  scheduleHref,
}: {
  readonly tables: readonly StandingsTableView[];
  /** Where "See the full schedule" goes while there is nothing to rank yet. */
  readonly scheduleHref?: string;
}) {
  const labels = displayLabels(t).standings;
  return tables.length === 0 ? (
    <EmptyPanel
      text={t('standings.empty')}
      action={
        scheduleHref === undefined
          ? undefined
          : { href: scheduleHref, label: t('home.fullSchedule') }
      }
    />
  ) : (
    <div className="ui-stack">
      {tables.map((table) => (
        <section key={table.key}>
          <StandingsTable
            caption={table.caption}
            idPrefix={table.key}
            columns={table.columns}
            rows={table.rows}
            footnotes={table.footnotes}
            labels={labels}
            emblems
          />
        </section>
      ))}
    </div>
  );
}

/** What the foot of the standings page is told: whose league, and which season's tables. */
export type StandingsFoot = {
  readonly addressee: LeagueAddressee & { readonly id: string };
  readonly season: { readonly id: string; readonly slug: string; readonly isCurrent: boolean };
};

/**
 * `/{league}/standings`: one table per division, shown to everyone as the league's page
 * (S-22: standings are never restricted). `after` draws what follows the tables once there
 * are tables to follow: the route puts the season's latest results there, which are the
 * schedule pages' to draw.
 */
export async function StandingsPage({
  league,
  search,
  after,
}: {
  /** The route's `[league]` value. */
  readonly league: string;
  readonly search: SearchParams;
  readonly after?: (foot: StandingsFoot) => ReactNode;
}) {
  const view = await loadLeaguePage(league, 'site');
  const addressee = view.context.league;
  const { publicStats } = await webPorts();
  const seasons = await seasonsOfLeague(addressee.id);
  const asked = firstValue(search['season']);
  const season = chooseSeason(seasons, asked);
  if (season === undefined && asked !== undefined && asked !== '') return notFound();
  const result =
    season === undefined ? undefined : await publicStats.standingsOf(addressee.id, season.id);
  if (result !== undefined && !result.ok) return notFound();
  const tables = result === undefined || !result.ok ? [] : buildStandingsViews(result.value);
  return (
    <main>
      <PageHead title={t('standings.heading')} kicker={season?.name} sub={t('standings.lead')} />
      {season === undefined || result === undefined || !result.ok ? (
        <EmptyPanel text={t('standings.noSeason')} />
      ) : (
        <>
          <StandingsTables
            tables={tables}
            scheduleHref={leagueUrl(addressee, 'schedule', {
              season: asked === undefined || asked === '' ? undefined : asked,
            })}
          />
          {after === undefined || tables.length === 0
            ? null
            : after({
                addressee,
                season: { id: season.id, slug: season.slug, isCurrent: season.isCurrent },
              })}
        </>
      )}
    </main>
  );
}
