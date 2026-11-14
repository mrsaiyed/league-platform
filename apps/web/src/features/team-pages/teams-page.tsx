import { leagueUrl } from '@srleagues/core';
import { EmptyPanel, FilterToolbar, PageHead, TeamCard as TeamCardPiece } from '@srleagues/ui';
import { displayLabels } from '@srleagues/site';
import { notFound } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import { chooseSeason, firstValue, SeasonChoice, type SearchParams } from '../stats-pages/index.ts';
import { loadTeamCards, type TeamCard } from './build-team.ts';

/**
 * The season's teams as cards, each one link to its team's page: the emblem and name, the
 * record as the card's one figure, then seed and division. Nothing here reads anything.
 */
export function TeamCards({ cards }: { readonly cards: readonly TeamCard[] }) {
  return (
    <ul className="ui-card-grid" aria-label={t('teams.title')}>
      {cards.map((card) => (
        <li key={card.slug}>
          <TeamCardPiece
            name={card.name}
            href={card.href}
            color={card.color}
            figure={{ label: t('teams.col.record'), value: card.recordText }}
            facts={[
              { key: 'seed', label: t('teams.col.seed'), value: card.seedText },
              {
                key: 'division',
                label: t('teams.col.division'),
                value: card.divisionName ?? t('teams.noDivision'),
              },
            ]}
          />
        </li>
      ))}
    </ul>
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
      <PageHead title={t('teams.title')} eyebrow={season?.name} />
      {season === undefined || cards === undefined ? (
        <EmptyPanel text={t('teams.noSeason')} />
      ) : (
        <>
          {seasons.length > 1 ? (
            <FilterToolbar label={displayLabels(t).filters}>
              <SeasonChoice
                seasons={seasons}
                chosen={season}
                action={leagueUrl(addressee, 'teams')}
              />
            </FilterToolbar>
          ) : null}
          {cards.length === 0 ? (
            <EmptyPanel text={t('teams.empty')} />
          ) : (
            <TeamCards cards={cards} />
          )}
        </>
      )}
    </main>
  );
}
