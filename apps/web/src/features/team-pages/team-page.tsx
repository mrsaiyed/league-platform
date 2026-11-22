import { leagueApiUrl, leagueUrl, publicViewer } from '@srleagues/core';
import {
  Emblem,
  EmptyPanel,
  NoValue,
  PageHead,
  Section,
  SortableStatsTable,
  StatStrip,
} from '@srleagues/ui';
import { displayLabels } from '@srleagues/site';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { seasonsOfLeague } from '../../server/league-seasons.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { locale, t } from '../../server/messages.ts';
import { myTeamCookieName } from '../../server/my-team-cookie.ts';
import { GameList } from '../schedule-pages/index.ts';
import { chooseSeason, firstValue, type SearchParams } from '../stats-pages/index.ts';
import {
  buildRoster,
  buildTeamGames,
  loadTeamHead,
  loadTeamStats,
  type RosterRowView,
  type RosterView,
  type TeamStatsView,
} from './build-team.ts';
import { chooseMyTeamAction, clearMyTeamAction } from './my-team-actions.ts';
import { TeamMine } from './my-team-marks.tsx';
import { leagueHomeStayUrl } from './start-page.ts';

function RosterTable({
  rows,
  caption,
}: {
  readonly rows: readonly RosterRowView[];
  readonly caption: string;
}) {
  return (
    <div className="ui-table-frame">
      <div className="ui-table-wrap" tabIndex={0} role="region" aria-label={caption}>
        <table className="ui-table">
          <caption className="ui-visually-hidden">{caption}</caption>
          <thead>
            <tr>
              <th scope="col" className="ui-num">
                {t('team.jersey')}
              </th>
              <th scope="col" className="ui-team-cell">
                {t('team.player')}
              </th>
              <th scope="col" className="ui-fit">
                {t('team.role')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="ui-num">
                  {row.number === '' ? (
                    // Someone with no number (a coach, say): a dash, never a blank cell.
                    <NoValue word={t('team.noNumber')} />
                  ) : (
                    row.number
                  )}
                </td>
                <th scope="row" className="ui-team-cell">
                  <span dir="auto">{row.name}</span>
                </th>
                <td className="ui-fit">{row.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The roster: those on the team now, then those who left. Nothing here reads anything. */
export function RosterSections({ roster }: { readonly roster: RosterView }) {
  if (roster.current.length === 0 && roster.former.length === 0) {
    return <EmptyPanel text={t('team.rosterEmpty')} />;
  }
  return (
    <div className="ui-stack">
      {roster.current.length === 0 ? (
        <EmptyPanel text={t('team.rosterEmpty')} />
      ) : (
        <RosterTable rows={roster.current} caption={t('team.roster')} />
      )}
      {roster.former.length === 0 ? null : (
        <div>
          <h3>{t('team.rosterFormer')}</h3>
          <RosterTable rows={roster.former} caption={t('team.rosterFormer')} />
        </div>
      )}
    </div>
  );
}

/** How many statistics a team's totals may have and still stand beside the players' table. */
const besideLimit = 4;

/**
 * The team's statistics as its setting allows: totals always, player lines when shown.
 * The totals are a strip of big numbers under their small label, never a table of one row
 * the width of the page: a few in one line, many wrapping onto a second (the strip's own
 * doing). With few statistics the totals and the players' table stand side by side on a
 * laptop, so a row's numbers stay near its name; with many each takes the page's width.
 * A team with nothing recorded says so in a calm panel, whoever may see its players.
 */
export function TeamStatsSection({ stats }: { readonly stats: TeamStatsView }) {
  const labels = displayLabels(t);
  if (!stats.hasNumbers) {
    return <EmptyPanel text={t('team.statsNone')} />;
  }
  const totals = stats.totalsRows[0];
  const numbers =
    totals === undefined
      ? []
      : stats.totalsColumns.slice(1).flatMap((column) => {
          const value = totals.cells[column.key];
          return value === null || value === undefined
            ? []
            : [{ key: column.key, label: column.fullName ?? column.label, value: String(value) }];
        });
  const beside = numbers.length > 0 && stats.totalsColumns.length - 1 <= besideLimit;
  // The players open sorted by points, biggest first, as on the statistics page; by the
  // first statistic where the sport has no points.
  const sortColumn =
    stats.playerColumns.find((column) => column.key === 'points') ??
    stats.playerColumns.find((column) => column.numeric === true && column.key !== 'games');
  const players =
    stats.playerLinesShown && stats.playerRows.length > 0 ? (
      <SortableStatsTable
        caption={t('team.statsPlayers')}
        columns={stats.playerColumns}
        rows={stats.playerRows}
        initialSort={
          sortColumn === undefined ? null : { key: sortColumn.key, direction: 'descending' }
        }
        locale={locale}
        labels={labels.stats}
        emblems
      />
    ) : null;
  return (
    <div className="team-stats" data-layout={beside && players !== null ? 'pair' : 'stack'}>
      {numbers.length === 0 ? null : (
        <div className="team-totals">
          <p className="ui-eyebrow">{t('team.statsTotals')}</p>
          <StatStrip label={t('team.statsTotals')} items={numbers} />
          {stats.playerLinesShown ? null : (
            <p className="ui-section-note">{t('team.statsTotalsOnly')}</p>
          )}
          {stats.totalsNote === null ? null : <p className="ui-section-note">{stats.totalsNote}</p>}
        </div>
      )}
      {players}
    </div>
  );
}

/**
 * Whether a team's results stand in the games' column beside the roster, or under both at
 * the page's width. A long roster beside a short list of games to come would leave the
 * games' column empty, so the results fill it; beside a short roster they would run far
 * past it and leave the roster's column empty, so they take the width instead. Reckoned
 * from how tall each is drawn: a row of two boards is about five roster lines.
 */
export function resultsBesideRoster(counts: {
  readonly upcoming: number;
  readonly rosterLines: number;
}): boolean {
  const boardRows = Math.max(1, Math.ceil(counts.upcoming / 2));
  return counts.rosterLines > (boardRows + 1) * 5;
}

/** `/{league}/teams/{team}`: roster, schedule, results and statistics of one team. */
export async function TeamPage({
  league,
  team: teamSlug,
  search,
}: {
  /** The route's `[league]` value. */
  readonly league: string;
  /** The route's `[team]` value. */
  readonly team: string;
  readonly search: SearchParams;
}) {
  const view = await loadLeaguePage(league, 'site');
  const addressee = view.context.league;
  const { publicStats, publicSchedule, publicTeams } = await webPorts();
  const seasons = await seasonsOfLeague(addressee.id);
  const asked = firstValue(search['season']);
  const season = chooseSeason(seasons, asked);
  if (season === undefined) return notFound();
  // The team's record, its statistics and its roster with the league's name settings, as
  // one snapshot (T-81, record 070): one child is never shown two ways on one page.
  const read = await publicStats.statisticsOf(
    addressee.id,
    async ({ store, settings, rosterOf }) => {
      const head = await loadTeamHead(store, addressee.id, season.id, teamSlug);
      if (head === undefined) return undefined;
      const stats = await loadTeamStats(store, settings, {
        leagueId: addressee.id,
        seasonId: season.id,
        teamId: head.teamId,
      });
      const roster = await rosterOf(head.teamId, publicViewer(addressee.id));
      return { head, stats, roster: buildRoster(roster) };
    },
  );
  if (read === undefined) return notFound();
  const { head, stats, roster } = read;
  const clock = await publicSchedule.clockOf(addressee.id);
  const schedule = await publicSchedule.scheduleOf(addressee.id, season.id, clock.today);
  const games = buildTeamGames(schedule, head.team.slug, clock, addressee);
  const offersMyTeam = (await publicTeams.startPageOf(addressee.id)) === 'myTeam';
  const remembered = (await cookies()).get(myTeamCookieName(addressee.id))?.value;
  const isMine = remembered === head.team.slug;
  const seasonOption = season.isCurrent ? {} : { season: season.slug };
  const resultsBeside = resultsBesideRoster({
    upcoming: games.upcoming.length,
    rosterLines: roster.current.length + roster.former.length,
  });
  const results = (
    <Section title={t('team.results')}>
      {games.results.length === 0 ? (
        <EmptyPanel text={t('team.noResults')} />
      ) : (
        <GameList
          leagueId={addressee.id}
          games={games.results}
          layout="board"
          across={resultsBeside ? 'pair' : 'two'}
        />
      )}
    </Section>
  );
  return (
    <main>
      <nav className="ui-crumbs">
        <a href={leagueHomeStayUrl(addressee, season.isCurrent ? undefined : season.slug)}>
          {t('team.leagueHome')}
        </a>{' '}
        <a href={leagueUrl(addressee, 'teams', seasonOption)}>{t('team.allTeams')}</a>
      </nav>
      <PageHead
        title={head.team.name}
        kicker={season.name}
        facts={[
          { key: 'seed', label: t('teams.col.seed'), value: head.seedValue },
          { key: 'record', label: t('teams.col.record'), value: head.recordText },
          ...(head.team.divisionName === null
            ? []
            : [
                {
                  key: 'division',
                  label: t('teams.col.division'),
                  value: head.team.divisionName,
                },
              ]),
        ]}
        lead={<Emblem name={head.team.name} color={head.team.color} size="large" />}
      >
        {/* What a signed-in member is told of their own team is read after the page, for
            them alone (TeamMine, step 2.168): the page is the same for everyone. Until it
            answers, and for everyone else, the device's choice, where the league offers it. */}
        <TeamMine address={leagueApiUrl(addressee, ['my-team'])} slug={head.team.slug}>
          {offersMyTeam ? (
            isMine ? (
              <form className="team-mine" action={clearMyTeamAction}>
                <input type="hidden" name="league" value={addressee.slug} />
                <input type="hidden" name="team" value={head.team.slug} />
                {season.isCurrent ? null : (
                  <input type="hidden" name="season" value={season.slug} />
                )}
                <p>{t('team.isMine')}</p>
                <button type="submit">{t('team.clearMine')}</button>
              </form>
            ) : (
              <form className="team-mine" action={chooseMyTeamAction}>
                <input type="hidden" name="league" value={addressee.slug} />
                <input type="hidden" name="team" value={head.team.slug} />
                {season.isCurrent ? null : (
                  <input type="hidden" name="season" value={season.slug} />
                )}
                <button type="submit">{t('team.makeMine')}</button>
                <p>{t('team.mineNote')}</p>
              </form>
            )
          ) : null}
        </TeamMine>
      </PageHead>
      {/* The games come first in the page and sit first on the screen, at every width, so
          the keyboard goes through the page in the order it is read. */}
      <div className="team-layout">
        <div className="team-games">
          <Section title={t('team.schedule')}>
            {games.upcoming.length === 0 ? (
              <EmptyPanel
                text={t('team.noSchedule')}
                action={{
                  href: leagueUrl(addressee, 'schedule', seasonOption),
                  label: t('home.fullSchedule'),
                }}
              />
            ) : (
              <GameList
                leagueId={addressee.id}
                games={games.upcoming}
                layout="board"
                across="pair"
              />
            )}
          </Section>
          {resultsBeside ? results : null}
        </div>
        <div className="team-roster">
          <Section title={t('team.roster')}>
            <RosterSections roster={roster} />
          </Section>
        </div>
      </div>
      {/* Beside a short roster the results take the page's width, under both columns. */}
      {resultsBeside ? null : results}
      <Section title={t('team.stats')}>
        {stats === undefined ? (
          <EmptyPanel text={t('team.statsNone')} />
        ) : (
          <TeamStatsSection stats={stats} />
        )}
      </Section>
    </main>
  );
}
