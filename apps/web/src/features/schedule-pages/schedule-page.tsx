import { leagueUrl } from '@srleagues/core';
import { OptionPicker, RoundPicker } from '@srleagues/ui';
import { displayLabels } from '@srleagues/site';
import { notFound } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import { chooseSeason, firstValue, SeasonChoice, type SearchParams } from '../stats-pages/index.ts';
import { buildScheduleView, parseRound } from './build-schedule.ts';
import { RoundSections } from './schedule-views.tsx';

/** `/{league}/schedule`: past rounds closed, the current one open, then the coming ones. */
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
  const { publicStats, publicSchedule } = await webPorts();
  const seasons = await publicStats.seasonsOf(addressee.id);
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
        <h1>{t('schedule.title')}</h1>
        <p>{t('schedule.noSeason')}</p>
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
      <h1>{t('schedule.title')}</h1>
      <SeasonChoice
        seasons={seasons}
        chosen={season}
        action={action}
        keep={{ ...(team === '' ? {} : { team }), ...(round === '' ? {} : { round }) }}
      />
      <p>{season.name}</p>
      {built.seasonIsEmpty ? (
        <p>{t('schedule.empty')}</p>
      ) : (
        <>
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
          {built.rounds.length === 0 ? (
            <p>{t('schedule.noMatch')}</p>
          ) : (
            <RoundSections leagueId={addressee.id} rounds={built.rounds} />
          )}
        </>
      )}
    </main>
  );
}
