import { leagueUrl, type LeagueAddressee } from '@srleagues/core';
import { Section } from '@srleagues/ui';
import { webPorts } from '../../server/container.ts';
import { t } from '../../server/messages.ts';
import { BeingCorrectedNote, countBeingCorrected } from './being-corrected-note.tsx';
import { buildHomeGames, type GameView } from './build-schedule.ts';
import { GameList } from './schedule-views.tsx';

/** How many results stand under the standings: one row of three on a laptop. */
export const latestResultsCount = 3;

/**
 * The section itself, drawn from games already chosen: under a kicker and a title, the
 * boards, and the way to the whole schedule. Nothing while no game is decided.
 */
export function LatestResultsSection({
  leagueId,
  games,
  scheduleHref,
}: {
  readonly leagueId: string;
  readonly games: readonly GameView[];
  readonly scheduleHref: string;
}) {
  if (games.length === 0) return null;
  return (
    <Section
      title={t('standings.results')}
      kicker={t('standings.results.kicker')}
      more={{ href: scheduleHref, label: t('home.fullSchedule') }}
    >
      <GameList leagueId={leagueId} games={games} layout="board" across="two" />
    </Section>
  );
}

/**
 * The season's latest decided games as scoreboards, newest first: what follows the tables
 * on the standings page, so the page does not end on a table (how the table got to be as
 * it is). Kept current from the league's live channel, as every list of games is.
 */
/**
 * The line under the standings page's tables while a game of the season is being corrected
 * and so is not counted in them (step 2.159, S-105); nothing otherwise.
 */
export async function StandingsBeingCorrected({
  addressee,
  season,
}: {
  readonly addressee: { readonly id: string };
  readonly season: { readonly id: string };
}) {
  const { publicSchedule } = await webPorts();
  const clock = await publicSchedule.clockOf(addressee.id);
  const schedule = await publicSchedule.scheduleOf(addressee.id, season.id, clock.today);
  return <BeingCorrectedNote count={countBeingCorrected(schedule, clock)} />;
}

export async function LatestResults({
  addressee,
  season,
}: {
  /** The league: its id, and what its addresses are built from. */
  readonly addressee: LeagueAddressee & { readonly id: string };
  readonly season: { readonly id: string; readonly slug: string; readonly isCurrent: boolean };
}) {
  const { publicSchedule } = await webPorts();
  const clock = await publicSchedule.clockOf(addressee.id);
  const schedule = await publicSchedule.scheduleOf(addressee.id, season.id, clock.today);
  if (schedule === undefined) return null;
  return (
    <LatestResultsSection
      leagueId={addressee.id}
      games={buildHomeGames(schedule, clock, addressee).recent.slice(0, latestResultsCount)}
      scheduleHref={leagueUrl(
        addressee,
        'schedule',
        season.isCurrent ? {} : { season: season.slug },
      )}
    />
  );
}
