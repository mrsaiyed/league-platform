import { leagueUrl } from '@srleagues/core';
import { notFound } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import { chooseSeason, firstValue, SeasonChoice, type SearchParams } from '../stats-pages/index.ts';
import { loadTeamCards, type TeamCard } from './build-team.ts';

/** The table of teams, each linked to its page. Nothing here reads anything. */
export function TeamsTable({ cards }: { readonly cards: readonly TeamCard[] }) {
  return (
    <div className="ui-table-wrap" tabIndex={0} role="region" aria-label={t('teams.title')}>
      <table className="ui-table">
        <caption className="ui-visually-hidden">{t('teams.title')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('teams.col.seed')}</th>
            <th scope="col">{t('teams.col.team')}</th>
            <th scope="col">{t('teams.col.record')}</th>
            <th scope="col">{t('teams.col.division')}</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((card) => (
            <tr key={card.slug}>
              <td>{card.seedText}</td>
              <th scope="row" dir="auto">
                <a href={card.href}>{card.name}</a>
              </th>
              <td>{card.recordText}</td>
              <td dir="auto">{card.divisionName ?? t('teams.noDivision')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** `/{league}/teams`: every team of the season with its record and seed. */
export async function TeamsPage({
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
  const cards =
    season === undefined
      ? undefined
      : await loadTeamCards(
          publicStats.readStoreOf(addressee.id),
          addressee,
          season,
          season.isCurrent,
        );
  if (season !== undefined && cards === undefined) return notFound();
  return (
    <main>
      <h1>{t('teams.title')}</h1>
      {season === undefined || cards === undefined ? (
        <p>{t('teams.noSeason')}</p>
      ) : (
        <>
          <SeasonChoice seasons={seasons} chosen={season} action={leagueUrl(addressee, 'teams')} />
          <p>{season.name}</p>
          {cards.length === 0 ? <p>{t('teams.empty')}</p> : <TeamsTable cards={cards} />}
        </>
      )}
    </main>
  );
}
