import { BinPage } from '../../../../../features/bin-area/index.ts';
import type { SearchProps } from '../../../../../features/settings-area/index.ts';
import type { LeagueRouteProps } from '../../../../../features/shell/index.ts';

export default async function Page({ params, searchParams }: LeagueRouteProps & SearchProps) {
  const { league } = await params;
  return <BinPage league={league} query={await searchParams} />;
}
