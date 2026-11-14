import { leagueUrl } from '@srleagues/core';
import { EmptyPanel, FilterToolbar, OptionPicker, PageHead, RoundPicker } from '@srleagues/ui';
import { displayLabels } from '@srleagues/site';
import { notFound } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { seasonsOfLeague } from '../../server/league-seasons.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import { chooseSeason, firstValue, type SearchParams } from '../stats-pages/index.ts';
import { buildScheduleView, parseRound } from './build-schedule.ts';
import { RoundSections } from './schedule-views.tsx';

/**
 * `/{league}/schedule`: past rounds closed, the current one open, then the coming ones. The
 * season is picked in the header; the round and the team in the page's own toolbar.
 */
export async function SchedulePage({
  league,
  search,
}: {
  /** The route's `[league]` value. */
  readonly league: string;
  readonly search: SearchParams;
}) {
  const view = await loadLeaguePage(league, 'site');
  const addressee = view.context.league;
  const { publicSchedule } = await webPorts();
  const seasons = await seasonsOfLeague(addressee.id);
  const asked = firstValue(search['season']);
  const season = chooseSeason(seasons, asked);
  if (season === undefined && asked !== undefined && asked !== '') return notFound();
  const clock = await publicSchedule.clockOf(addressee.id);
  const schedule =
    season === undefined
      ? undefined
      : await publicSchedule.scheduleOf(addressee.id, season.id, clock.today);
  if (season !== undefined && schedule === undefined) return notFound();
  if (season === undefined || schedule === undefined) {
    return (
      <main>
        <PageHead title={t('schedule.title')} />
        <EmptyPanel text={t('schedule.noSeason')} />
      </main>
    );
  }
  const teamAsked = firstValue(search['team']);
  const roundAsked = parseRound(firstValue(search['round']));
  const built = buildScheduleView(schedule, clock, addressee, {
    team: teamAsked === undefined || teamAsked === '' ? undefined : teamAsked,
    round: roundAsked,
  });
  const team = built.teamOptions.some((o) => o.value === teamAsked) ? (teamAsked ?? '') : '';
  const round = built.roundOptions.some((o) => o.value === String(roundAsked))
    ? String(roundAsked)
    : '';
  const labels = displayLabels(t);
  const action = leagueUrl(addressee, 'schedule');
  const keepSeason = asked === undefined || asked === '' ? {} : { season: asked };
  return (
    <main>
      <PageHead title={t('schedule.title')} eyebrow={season.name} />
      {built.seasonIsEmpty ? null : (
        <FilterToolbar label={labels.filters}>
          <RoundPicker
            label={labels.round}
            submitLabel={labels.show}
            action={action}
            value={round}
            options={built.roundOptions}
            keep={{ ...keepSeason, ...(team === '' ? {} : { team }) }}
          />
          <OptionPicker
            name="team"
            label={t('schedule.team')}
            submitLabel={labels.show}
            action={action}
            value={team}
            options={built.teamOptions}
            keep={{ ...keepSeason, ...(round === '' ? {} : { round }) }}
          />
        </FilterToolbar>
      )}
      {built.seasonIsEmpty ? (
        <EmptyPanel
          text={t('schedule.empty')}
          action={{
            href: leagueUrl(addressee, 'teams', { ...keepSeason }),
            label: t('home.seeTeams'),
          }}
        />
      ) : built.rounds.length === 0 ? (
        <EmptyPanel
          text={t('schedule.noMatch')}
          action={{
            href: leagueUrl(addressee, 'schedule', { ...keepSeason }),
            label: t('schedule.showAll'),
          }}
        />
      ) : (
        <RoundSections leagueId={addressee.id} rounds={built.rounds} />
      )}
    </main>
  );
}
