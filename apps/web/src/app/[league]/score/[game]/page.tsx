import { TrackerPage } from '../../../../features/tracker/index.ts';

type GameRouteProps = {
  readonly params: Promise<{ readonly league: string; readonly game: string }>;
};

/** The courtside tracker for one game (P2 §4, P7 §5.1): features/tracker/tracker-page.tsx. */
export default async function Page({ params }: GameRouteProps) {
  const { league, game } = await params;
  return <TrackerPage league={league} game={game} />;
}
