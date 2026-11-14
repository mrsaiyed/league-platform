import { leagueUrl, readStandings } from '@srleagues/core';
import { SeasonPicker, StandingsTable } from '@srleagues/ui';
import { displayLabels } from '@srleagues/site';
import { notFound } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import type { PublicSeason } from '../../server/public-stats.ts';
import { buildStandingsViews, type StandingsTableView } from './build-standings.ts';
import { chooseSeason, firstValue } from './choose-season.ts';

export type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

/** The picker for the season; a league with one season has nothing to pick. */
export function SeasonChoice({
  seasons,
  chosen,
  action,
  keep,
}: {
  readonly seasons: readonly PublicSeason[];
  readonly chosen: PublicSeason;
  readonly action: string;
  /** Other choices in the address to carry along. */
  readonly keep?: Readonly<Record<string, string>>;
}) {
  if (seasons.length < 2) return null;
  const labels = displayLabels(t);
  return (
    <SeasonPicker
      label={labels.season}
      submitLabel={labels.show}
      action={action}
      value={chosen.slug}
      {...(keep === undefined ? {} : { keep })}
      options={seasons.map((s) => ({ value: s.slug, label: s.name }))}
    />
  );
}

/** The tables of one season, as the page draws them. Nothing here reads anything. */
export function StandingsTables({ tables }: { readonly tables: readonly StandingsTableView[] }) {
  const labels = displayLabels(t).standings;
  return tables.length === 0 ? (
    <p>{t('standings.empty')}</p>
  ) : (
    <>
      {tables.map((table) => (
        <section key={table.key}>
          <StandingsTable
            caption={table.caption}
            idPrefix={table.key}
            columns={table.columns}
            rows={table.rows}
            footnotes={table.footnotes}
            labels={labels}
          />
        </section>
      ))}
    </>
  );
}

/** `/{league}/standings`: one table per division, shown to everyone as the league's page (S-22: standings are never restricted). */
export async function StandingsPage({
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
  const result =
    season === undefined
      ? undefined
      : await readStandings(publicStats.readStoreOf(addressee.id), { seasonId: season.id });
  if (result !== undefined && !result.ok) return notFound();
  return (
    <main>
      <h1>{t('standings.title')}</h1>
      {season === undefined || result === undefined || !result.ok ? (
        <p>{t('standings.noSeason')}</p>
      ) : (
        <>
          <SeasonChoice
            seasons={seasons}
            chosen={season}
            action={leagueUrl(addressee, 'standings')}
          />
          <p>{season.name}</p>
          <StandingsTables tables={buildStandingsViews(result.value)} />
        </>
      )}
    </main>
  );
}
