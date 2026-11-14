import { leagueUrl, publicViewer } from '@srleagues/core';
import { SortableStatsTable } from '@srleagues/ui';
import { displayLabels } from '@srleagues/site';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
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
import { leagueHomeStayUrl } from './start-page.ts';

function RosterTable({
  rows,
  caption,
}: {
  readonly rows: readonly RosterRowView[];
  readonly caption: string;
}) {
  return (
    <div className="ui-table-wrap" tabIndex={0} role="region" aria-label={caption}>
      <table className="ui-table">
        <caption className="ui-visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{t('team.jersey')}</th>
            <th scope="col">{t('team.player')}</th>
            <th scope="col">{t('team.role')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.number}</td>
              <th scope="row" dir="auto">
                {row.name}
              </th>
              <td>{row.role}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The roster: those on the team now, then those who left. Nothing here reads anything. */
export function RosterSections({ roster }: { readonly roster: RosterView }) {
  if (roster.current.length === 0 && roster.former.length === 0) {
    return <p>{t('team.rosterEmpty')}</p>;
  }
  return (
    <>
      {roster.current.length === 0 ? (
        <p>{t('team.rosterEmpty')}</p>
      ) : (
        <RosterTable rows={roster.current} caption={t('team.roster')} />
      )}
      {roster.former.length === 0 ? null : (
        <>
          <h3>{t('team.rosterFormer')}</h3>
          <RosterTable rows={roster.former} caption={t('team.rosterFormer')} />
        </>
      )}
    </>
  );
}

/** The team's statistics as its setting allows: totals always, player lines when shown. */
export function TeamStatsSection({ stats }: { readonly stats: TeamStatsView }) {
  const labels = displayLabels(t);
  if (!stats.hasNumbers && stats.playerLinesShown) return <p>{t('team.statsNone')}</p>;
  return (
    <>
      {stats.totalsRows.length > 0 ? (
        <SortableStatsTable
          caption={t('team.statsTotals')}
          columns={stats.totalsColumns}
          rows={stats.totalsRows}
          locale={locale}
          labels={labels.stats}
        />
      ) : null}
      {stats.playerLinesShown ? (
        stats.playerRows.length > 0 ? (
          <SortableStatsTable
            caption={t('team.statsPlayers')}
            columns={stats.playerColumns}
            rows={stats.playerRows}
            locale={locale}
            labels={labels.stats}
          />
        ) : null
      ) : (
        <p>{t('team.statsTotalsOnly')}</p>
      )}
    </>
  );
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
  const seasons = await publicStats.seasonsOf(addressee.id);
  const asked = firstValue(search['season']);
  const season = chooseSeason(seasons, asked);
  if (season === undefined) return notFound();
  const store = publicStats.readStoreOf(addressee.id);
  const head = await loadTeamHead(store, addressee.id, season.id, teamSlug);
  if (head === undefined) return notFound();
  const settings = await publicStats.settingsOf(addressee.id);
  const clock = await publicSchedule.clockOf(addressee.id);
  const schedule = await publicSchedule.scheduleOf(addressee.id, season.id, clock.today);
  const games = buildTeamGames(schedule, head.team.slug, clock, addressee);
  const roster = buildRoster(
    await publicTeams.rosterOf(addressee.id, head.teamId, {
      viewer: publicViewer(addressee.id),
      policy: settings.namePolicy,
    }),
  );
  const stats = await loadTeamStats(store, settings, {
    leagueId: addressee.id,
    seasonId: season.id,
    teamId: head.teamId,
  });
  const offersMyTeam = (await publicTeams.startPageOf(addressee.id)) === 'myTeam';
  const remembered = (await cookies()).get(myTeamCookieName(addressee.id))?.value;
  const isMine = remembered === head.team.slug;
  const seasonOption = season.isCurrent ? {} : { season: season.slug };
  return (
    <main>
      <h1 dir="auto">{head.team.name}</h1>
      <p>
        {head.headline}
      </p>
      <p>{season.name}</p>
      <nav>
        <a href={leagueHomeStayUrl(addressee, season.isCurrent ? undefined : season.slug)}>
          {t('team.leagueHome')}
        </a>{' '}
        <a href={leagueUrl(addressee, 'teams', seasonOption)}>{t('team.allTeams')}</a>
      </nav>
      {offersMyTeam ? (
        isMine ? (
          <form action={clearMyTeamAction}>
            <input type="hidden" name="league" value={addressee.slug} />
            <input type="hidden" name="team" value={head.team.slug} />
            {season.isCurrent ? null : <input type="hidden" name="season" value={season.slug} />}
            <p>{t('team.isMine')}</p>
            <button type="submit">{t('team.clearMine')}</button>
          </form>
        ) : (
          <form action={chooseMyTeamAction}>
            <input type="hidden" name="league" value={addressee.slug} />
            <input type="hidden" name="team" value={head.team.slug} />
            {season.isCurrent ? null : <input type="hidden" name="season" value={season.slug} />}
            <button type="submit">{t('team.makeMine')}</button>
            <p>{t('team.mineNote')}</p>
          </form>
        )
      ) : null}
      <section>
        <h2>{t('team.roster')}</h2>
        <RosterSections roster={roster} />
      </section>
      <section>
        <h2>{t('team.schedule')}</h2>
        {games.upcoming.length === 0 ? (
          <p>{t('team.noSchedule')}</p>
        ) : (
          <GameList leagueId={addressee.id} games={games.upcoming} />
        )}
      </section>
      <section>
        <h2>{t('team.results')}</h2>
        {games.results.length === 0 ? (
          <p>{t('team.noResults')}</p>
        ) : (
          <GameList leagueId={addressee.id} games={games.results} />
        )}
      </section>
      <section>
        <h2>{t('team.stats')}</h2>
        {stats === undefined ? <p>{t('team.statsNone')}</p> : <TeamStatsSection stats={stats} />}
      </section>
    </main>
  );
}
