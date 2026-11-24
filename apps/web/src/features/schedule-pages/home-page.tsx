import { leagueUrl } from '@srleagues/core';
import { CallBand, EmptyPanel, Hero, Section, StandingsTable, StatStrip } from '@srleagues/ui';
import { displayLabels } from '@srleagues/site';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { webPorts } from '../../server/container.ts';
import { seasonsOfLeague } from '../../server/league-seasons.ts';
import { leagueSites, siteOf } from '../../server/league-site.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import {
  buildStandingsViews,
  chooseSeason,
  firstValue,
  fitHomeLeaders,
  homeAcrossRoom,
  homeLeadersOf,
  type SearchParams,
  type StandingsTableView,
} from '../stats-pages/index.ts';
import { buildHomeNumbers } from './build-home-numbers.ts';
import { buildHomeGames } from './build-schedule.ts';
import { HomeLeaders } from './home-leaders.tsx';
import { homeLeadersPlace, homeNextGames, homeNextTitle, homeResults } from './home-lists.ts';
import { GameList } from './schedule-views.tsx';

/** The columns the home page's compact standings keep. */
const compactColumns: readonly string[] = ['played', 'wins', 'losses', 'winPercentage'];

/**
 * A division's table cut down to the few columns that fit beside the games, with each
 * level-teams note cut to its first sentence where it was made (step 2.198): who is level
 * and on what; "See the full standings" leads to the reasons.
 */
export function compactStandings(table: StandingsTableView): StandingsTableView {
  const kept = new Set(compactColumns);
  return {
    ...table,
    // Games played is left off on a phone: the small table fits beside the name there.
    columns: table.columns
      .filter((c) => kept.has(c.key))
      .map((c) => (c.narrow === 'left-out' ? { ...c, narrow: 'wide-only' as const } : c)),
    footnotes: table.briefFootnotes,
  };
}

/**
 * `/{league}`: a hero with the league's name, the season and two ways on, and the game
 * being played now beside it when there is one; the season in four numbers; the next
 * games as scoreboards, when any are coming; then the latest games (decided ones first)
 * beside the compact standings; and one call to action near the foot. The season is picked
 * in the header.
 */
export async function HomePage({
  league,
  search,
  yourTeam = null,
}: {
  /** The route's `[league]` value. */
  readonly league: string;
  readonly search: SearchParams;
  /**
   * The person's own team, or this device's, at the top of the column: drawn by the page's
   * script after it has arrived (team-pages, YourTeamLine; step 2.168), so nothing here
   * reads anyone's.
   */
  readonly yourTeam?: ReactNode;
}) {
  const view = await loadLeaguePage(league, 'site');
  const addressee = view.context.league;
  const name = (await siteOf(addressee, await leagueSites())).name;
  const { publicStats, publicSchedule } = await webPorts();
  const seasons = await seasonsOfLeague(addressee.id);
  const asked = firstValue(search['season']);
  const season = chooseSeason(seasons, asked);
  if (season === undefined && asked !== undefined && asked !== '') return notFound();
  if (season === undefined) {
    return (
      <main className="site-wide">
        <Hero title={name} columnClass="site-column" />
        <div className="site-column home-alone">
          <EmptyPanel text={t('home.noSeason')} />
        </div>
      </main>
    );
  }
  const clock = await publicSchedule.clockOf(addressee.id);
  const schedule = await publicSchedule.scheduleOf(addressee.id, season.id, clock.today);
  if (schedule === undefined) return notFound();
  const standings = await publicStats.standingsOf(addressee.id, season.id);
  const tables = standings.ok ? buildStandingsViews(standings.value) : [];
  const games = buildHomeGames(schedule, clock, addressee);
  const labels = displayLabels(t);
  const askedSeason = asked === undefined || asked === '' ? undefined : asked;
  const hasStandings = tables.some((table) => table.rows.length > 0);
  const empty =
    games.recent.length === 0 && games.upcoming.length === 0 && games.awaiting.length === 0;
  // A game being played now comes first: in the hero, under its own heading.
  const live = games.upcoming.filter((game) => game.status === 'live');
  const next = homeNextGames(games.upcoming);
  const results = homeResults(
    games.recent,
    tables.map((table) => ({ rows: table.rows.length, hasNotes: table.footnotes.length > 0 })),
  );
  const tableHeights = tables
    .filter((table) => table.rows.length > 0)
    .map((table) => ({ rows: table.rows.length, hasNotes: table.footnotes.length > 0 }));
  // The season's leaders, as the statistics page reads them: names by the league's name
  // setting, and nobody from a team whose numbers are staff only. A read that fails
  // leaves the leaders out; it never takes the page down.
  const leaders = await homeLeadersOf(publicStats, {
    leagueId: addressee.id,
    seasonId: season.id,
  });
  const leadersPlace = homeLeadersPlace(empty ? 0 : results.length, tableHeights, leaders.length);
  // A whole place at a time: a shared place the room cannot hold is left to one line.
  const leadersBeside = fitHomeLeaders(leaders, leadersPlace.beside);
  const leadersAcross = fitHomeLeaders(leaders, Math.min(leadersPlace.across, homeAcrossRoom));
  const statsHref = leagueUrl(addressee, 'stats', { season: askedSeason });
  const teamCount = tables.reduce((sum, table) => sum + table.rows.length, 0);
  const scheduleHref = leagueUrl(addressee, 'schedule', { season: askedSeason });
  const standingsHref = leagueUrl(addressee, 'standings', { season: askedSeason });
  const teamsHref = leagueUrl(addressee, 'teams', { season: askedSeason });
  const manyTables = tables.length > 2;
  // A level-teams note the home page shortened: the whole of it is on the standings page.
  const shortened = tables.some((table) =>
    table.briefFootnotes.some((note, n) => note.text !== table.footnotes[n]?.text),
  );
  return (
    <main className="site-wide">
      <Hero
        title={name}
        kicker={season.name}
        text={t('home.hero.text')}
        columnClass="site-column"
        actions={[
          { href: scheduleHref, label: t('home.hero.schedule'), kind: 'main' },
          { href: standingsHref, label: t('home.hero.standings'), kind: 'second' },
        ]}
      >
        {live.length > 0 ? (
          <section className="home-live">
            <h2 className="ui-kicker home-live-title">{t('home.liveNow')}</h2>
            <GameList leagueId={addressee.id} games={live} layout="board" across="one" featured />
          </section>
        ) : null}
      </Hero>
      <div className="site-column">
        {yourTeam}
        <div className="home-numbers">
          <StatStrip label={t('home.numbers')} items={buildHomeNumbers(schedule, teamCount)} />
        </div>
        {empty ? (
          <Section title={t('home.recentResults')} kicker={t('home.results.kicker')}>
            <EmptyPanel
              text={t('home.noGames')}
              action={{ href: teamsHref, label: t('home.seeTeams') }}
            />
          </Section>
        ) : null}
        {/* With nothing coming there is no section to say so: the page leads with its
            latest games and the standings. */}
        {next.length === 0 ? null : (
          <Section
            title={t(homeNextTitle(next))}
            kicker={t('home.upcoming.kicker')}
            more={{ href: scheduleHref, label: t('home.fullSchedule') }}
          >
            {/* On a phone only the first two are drawn, with the way to the full schedule
                over them, so the standings are reached sooner (the stylesheet). */}
            <div className="home-next" data-live={live.length > 0 ? 'true' : undefined}>
              <GameList leagueId={addressee.id} games={next} layout="board" across="two" />
            </div>
          </Section>
        )}
        {/* A game whose start has passed with no score: a short list of its own, never
            among the games to come or the results (step 2.159). */}
        {games.awaiting.length === 0 ? null : (
          <Section
            title={t('schedule.waitingForScore')}
            kicker={t('schedule.waitingForScore.kicker')}
          >
            <div className="home-awaiting" data-awaiting-list="">
              <GameList
                leagueId={addressee.id}
                games={games.awaiting}
                layout="board"
                across="two"
              />
            </div>
          </Section>
        )}
        <div
          className="home-pair"
          data-tables={manyTables ? 'many' : 'few'}
          data-live={live.length > 0 ? 'true' : undefined}
        >
          {empty ? null : (
            <Section title={t('home.recentResults')} kicker={t('home.results.kicker')}>
              {results.length === 0 ? (
                <EmptyPanel
                  text={t('home.noResults')}
                  action={{ href: scheduleHref, label: t('home.fullSchedule') }}
                />
              ) : (
                <GameList
                  leagueId={addressee.id}
                  games={results}
                  layout="board"
                  across={manyTables ? 'two' : 'one'}
                />
              )}
            </Section>
          )}
          <Section
            title={t('home.standings')}
            kicker={t('home.standings.kicker')}
            more={{ href: standingsHref, label: t('home.fullStandings') }}
          >
            {hasStandings ? (
              <>
                <div className="home-tables">
                  {tables.map((raw) => {
                    const table = compactStandings(raw);
                    return (
                      <StandingsTable
                        key={table.key}
                        caption={table.caption}
                        idPrefix={`home-${table.key}`}
                        columns={table.columns}
                        rows={table.rows}
                        footnotes={table.footnotes}
                        labels={labels.standings}
                        emblems
                      />
                    );
                  })}
                </div>
                {shortened ? (
                  <p className="home-notes-more">
                    <a href={standingsHref}>{t('home.whyThisOrder')}</a>
                  </p>
                ) : null}
              </>
            ) : (
              <EmptyPanel
                text={t('home.standingsEmpty')}
                action={{ href: scheduleHref, label: t('home.fullSchedule') }}
              />
            )}
            {/* A short column of standings is filled out with the season's leaders, each
                one short row, so the two columns end about level. */}
            <HomeLeaders
              leaders={leadersBeside.leaders}
              levelCut={leadersBeside.levelCut}
              placing="beside"
              statsHref={statsHref}
            />
          </Section>
        </div>
        <HomeLeaders
          leaders={leadersAcross.leaders}
          levelCut={leadersAcross.levelCut}
          placing="across"
          statsHref={statsHref}
        />
        <CallBand
          title={t('home.call.title')}
          text={t('home.call.text')}
          action={{ href: teamsHref, label: t('home.call.action') }}
        />
      </div>
    </main>
  );
}
