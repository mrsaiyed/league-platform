import { TrackedGridPage } from '../../../../../../features/games-area/index.ts';

type EditRouteProps = {
  readonly params: Promise<{ readonly league: string; readonly game: string }>;
};

// A tracked game's "edit box score" grid (step 2.65). Its answers never ride in the
// address (T-271, record 067), so the page reads no query.
export default async function Page({ params }: EditRouteProps) {
  const { league, game } = await params;
  return <TrackedGridPage league={league} gameId={game} />;
}
