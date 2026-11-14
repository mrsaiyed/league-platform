// A game's page, `/{league}/games/{game}` (step 2.45; P7 §5.3; T6 §6). The game arrives
// drawn with how it stands, read as a visitor so the page is the same for everyone (T-87,
// S-22), and its live part then keeps itself current on the device (live-game-view.tsx).
// A finished game shows both box scores; every game shows its play-by-play as it stood
// when the page was read; a corrected game shows "corrected" with the date, not the
// reason (S-7).
import {
  leagueApiUrl,
  leagueUrl,
  publicViewer,
  readGamePage,
  readGameSnapshot,
} from '@srleagues/core';
import { notFound } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { isGameIdFormat } from '../../server/league-api.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import {
  buildBoxScores,
  buildPlays,
  correctedText,
  gameTitle,
  gameWords,
  startText,
} from './build-game.ts';
import { GameContent } from './game-content.tsx';

export async function GamePage({
  league,
  game,
}: {
  /** The route's `[league]` value. */
  readonly league: string;
  /** The route's `[game]` value. */
  readonly game: string;
}) {
  const view = await loadLeaguePage(league, 'site');
  const addressee = view.context.league;
  if (!isGameIdFormat(game)) return notFound();
  const { tracker, publicSchedule } = await webPorts();
  const names = await tracker.namesShownOf(addressee.id);
  const viewing = {
    leagueId: addressee.id,
    viewer: publicViewer(addressee.id),
    audience: names.audience,
    policy: names.policy,
  };
  const store = tracker.snapshotStoreOf(addressee.id);
  const [snapshot, page, clock] = await Promise.all([
    readGameSnapshot(store, { gameId: game }, viewing, tracker.clock.now()),
    readGamePage(store, { gameId: game }, viewing),
    publicSchedule.clockOf(addressee.id),
  ]);
  if (!snapshot.ok || !page.ok) return notFound();
  const words = gameWords();
  return (
    <GameContent
      view={{
        leagueId: addressee.id,
        title: gameTitle(page.value),
        status: page.value.game.status,
        start: startText(page.value.game.startsAt, clock.timeZone, page.value.game.status),
        corrected: correctedText(snapshot.value.correctedOn ?? page.value.game.correctedOn),
        snapshot: snapshot.value,
        snapshotAddress: leagueApiUrl(addressee, ['games', snapshot.value.gameId, 'snapshot']),
        selfAddress: leagueUrl(addressee, 'game', { game: snapshot.value.gameId }),
        boxScores: snapshot.value.status === 'final' ? buildBoxScores(page.value) : null,
        plays: buildPlays(page.value, words),
      }}
    />
  );
}
