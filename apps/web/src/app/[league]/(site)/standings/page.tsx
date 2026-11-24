import {
  LatestResults,
  StandingsBeingCorrected,
} from '../../../../features/schedule-pages/index.ts';
import { StandingsPage } from '../../../../features/stats-pages/index.ts';
import type { LeagueRouteProps } from '../../../../features/shell/index.ts';

export default async function Page({
  params,
  searchParams,
}: LeagueRouteProps & {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const { league } = await params;
  // The tables are the statistics pages' and the scoreboards the schedule pages': the page
  // is put together here, the latest results standing after the tables. The line on a game being corrected
  // (S-105) stands right under them.
  return (
    <StandingsPage
      league={league}
      search={await searchParams}
      beside={(foot) => <StandingsBeingCorrected addressee={foot.addressee} season={foot.season} />}
      after={(foot) => <LatestResults addressee={foot.addressee} season={foot.season} />}
    />
  );
}
