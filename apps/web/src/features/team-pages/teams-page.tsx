import { EmptyPanel, PageHead, TeamCard as TeamCardPiece } from '@srleagues/ui';
import { notFound } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { seasonsOfLeague } from '../../server/league-seasons.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import { chooseSeason, firstValue, type SearchParams } from '../stats-pages/index.ts';
import { loadTeamCards, type TeamCard } from './build-team.ts';
import { leagueHomeStayUrl } from './start-page.ts';

/**
 * The season's teams as cards, each one link to its team's page: the emblem and name, the
 * record as the card's one figure, then seed and, where the league has divisions, division.
 * Nothing here reads anything.
 */
export function TeamCards({ cards }: { readonly cards: readonly TeamCard[] }) {
  // A league with no divisions says nothing about divisions; one that has them says which
  // team has none.
  const hasDivisions = cards.some((card) => card.divisionName !== null);
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
              ...(hasDivisions
                ? [
                    {
                      key: 'division',
                      label: t('teams.col.division'),
                      value: card.divisionName ?? t('teams.noDivision'),
                    },
                  ]
                : []),
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
  const seasons = await seasonsOfLeague(addressee.id);
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
          {cards.length === 0 ? (
            <EmptyPanel
              text={t('teams.empty')}
              action={{
                href: leagueHomeStayUrl(addressee, season.isCurrent ? undefined : season.slug),
                label: t('shell.backToLeague'),
              }}
            />
          ) : (
            <TeamCards cards={cards} />
          )}
        </>
      )}
    </main>
  );
}
