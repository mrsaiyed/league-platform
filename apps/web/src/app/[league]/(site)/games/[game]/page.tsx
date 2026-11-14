import { GamePage } from '../../../../../features/live-game/index.ts';

export default async function Page({
  params,
}: {
  readonly params: Promise<{ readonly league: string; readonly game: string }>;
}) {
  const { league, game } = await params;
  return <GamePage league={league} game={game} />;
}
