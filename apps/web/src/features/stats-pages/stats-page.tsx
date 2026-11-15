import { leagueUrl } from '@srleagues/core';
import {
  EmptyPanel,
  FilterToolbar,
  LeaderCard,
  LeaderSpot,
  OptionPicker,
  PageHead,
  Section,
  SortableStatsTable,
  type LeaderEntry,
} from '@srleagues/ui';
import { displayLabels } from '@srleagues/site';
import { notFound } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { seasonsOfLeague } from '../../server/league-seasons.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { locale, t } from '../../server/messages.ts';
import { loadStatsPage, parseBy, type LeaderBoard, type StatsPageData } from './build-stats.ts';
import { chooseSeason, firstValue } from './choose-season.ts';
import type { SearchParams } from './standings-page.tsx';

/** How many statistics open with a number card: three, as many as stand across a laptop. */
const cardLimit = 3;

/** One leader board as the card draws it: each leader's place and name, team and games, and number. */
function leaderEntries(board: LeaderBoard): readonly LeaderEntry[] {
  return board.rows.map((row) => {
    const games = row.cells['games'];
    return {
      id: row.id,
      name: String(row.cells['player'] ?? ''),
      detail: t('stats.leaderDetail', {
        team: String(row.cells['team'] ?? ''),
        games: t.plural('stats.leaderGames', typeof games === 'number' ? games : 0),
      }),
      value: String(row.cells['value'] ?? ''),
    };
  });
}

/** The leaders, the full table of players and the teams' totals. Nothing here reads anything. */
export function StatsTables({
  data,
  scheduleHref,
}: {
  readonly data: StatsPageData;
  /** Where "See the full schedule" goes while no numbers have been recorded. */
  readonly scheduleHref?: string;
}) {
  const labels = displayLabels(t);
  const boards = data.leaders.filter((board) => board.rows.length > 0);
  const hasNumbers =
    data.playerRows.length > 0 ||
    data.teamRows.some((row) =>
      Object.entries(row.cells).some(([key, value]) => key !== 'team' && value !== null),
    );
  if (!hasNumbers) {
    return (
      <EmptyPanel
        text={t('stats.empty')}
        action={
          scheduleHref === undefined
            ? undefined
            : { href: scheduleHref, label: t('home.fullSchedule') }
        }
      />
    );
  }
  // Each statistic is a column of its own. The first three that one player leads alone
  // open with a number card (one very large number, the first on the league's main color),
  // and the rest of that statistic's list stands right under its own card, going on from
  // second place: the leader is not said twice. A statistic whose first place is shared
  // names no one leader: it has no card, and its list shows the players level at 1. So
  // does a statistic after the third card: a plain list from first place.
  const alone = boards.filter((board) => board.first !== undefined && !board.first.tied);
  const carded = new Set(alone.slice(0, cardLimit).map((board) => board.key));
  const columns = boards.map((board) => {
    const entries = leaderEntries(board);
    const card = carded.has(board.key) ? board.first : undefined;
    return { board, card, entries: card === undefined ? entries : entries.slice(1) };
  });
  const firstCard = columns.find((column) => column.card !== undefined)?.board.key;
  // Few statistics: the players' table and the teams' sit side by side on a laptop, so a
  // row's numbers stay near its name. Many: each takes the page's width.
  const sideBySide = data.playerColumns.length <= 7;
  return (
    <>
      <Section
        title={t('stats.leaders')}
        note={data.minimumGames > 0 ? t.plural('stats.minimumGames', data.minimumGames) : undefined}
      >
        {boards.length > 0 ? (
          <ul
            className="ui-spot-row stats-leaders"
            data-across={(['one', 'two', 'three'] as const)[Math.min(columns.length, 3) - 1]}
          >
            {columns.map(({ board, card, entries }) => (
              <li key={board.key} className="stats-leader">
                {card === undefined ? null : (
                  <LeaderSpot
                    label={t('stats.leaderOf', { stat: board.title })}
                    value={card.value}
                    unit={t(data.by === 'average' ? 'home.leaders.perGame' : 'stats.inAll')}
                    name={card.name}
                    detail={t('stats.leaderDetail', {
                      team: card.teams,
                      games: t.plural('stats.leaderGames', card.games),
                    })}
                    team={card.team}
                    first={board.key === firstCard}
                  />
                )}
                {entries.length === 0 ? null : (
                  <LeaderCard
                    title={board.title}
                    entries={entries}
                    afterLeader={card !== undefined}
                  />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyPanel text={t('stats.leadersNone')} />
        )}
      </Section>
      <div className="stats-tables" data-layout={sideBySide ? 'pair' : 'stack'}>
        <Section title={t('stats.allPlayers')}>
          <SortableStatsTable
            caption={t('stats.allPlayers')}
            captionHidden
            columns={data.playerColumns}
            rows={data.playerRows}
            locale={locale}
            labels={labels.stats}
            emblems
          />
        </Section>
        <Section
          title={t('stats.teams')}
          note={
            data.totalsOnlyTeams.length > 0
              ? t('stats.teamsTotalsOnly', {
                  teams: data.totalsOnlyTeams.join(t('stats.teamsJoin')),
                })
              : undefined
          }
        >
          <SortableStatsTable
            caption={t('stats.teams')}
            captionHidden
            columns={data.teamColumns}
            rows={data.teamRows}
            locale={locale}
            labels={labels.stats}
            emblems
          />
        </Section>
      </div>
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
