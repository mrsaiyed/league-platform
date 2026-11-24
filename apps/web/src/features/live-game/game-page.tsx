// A game's page, `/{league}/games/{game}` (step 2.45; P7 §5.3; T6 §6). The game arrives
// drawn with how it stands, read as a visitor so the page is the same for everyone (T-87,
// S-22), and its live part then keeps itself current on the device (live-game-view.tsx).
// A finished game shows both box scores; a live game, or one with plays, shows its
// play-by-play as it stood when the page was read, and the page is drawn again when the
// game starts or ends (record 051); a corrected game shows "corrected" with the date, not the
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
import { t } from '../../server/messages.ts';
import { placeOf } from '../schedule-pages/index.ts';
import { staffNumbersAddress } from '../staff-numbers/index.ts';
import { loadTeamCardsOf } from '../team-pages/index.ts';
import {
  boardColors,
  boardFinalPill,
  boardWhen,
  buildBoxScores,
  buildPlays,
  correctedText,
  gameTitle,
  gameTruthOf,
  gameWords,
  truthLine,
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
  const { tracker, publicSchedule, publicStats } = await webPorts();
  // The game and the league's name settings in one snapshot (record 076), the snapshot
  // and the page one after another, as they share its one connection.
  const read = tracker.gameReadsOf(addressee.id, async ({ store, audience, policy }) => {
    const viewing = {
      leagueId: addressee.id,
      viewer: publicViewer(addressee.id),
      audience,
      policy,
    };
    const shown = await readGameSnapshot(store, { gameId: game }, viewing, tracker.clock.now());
    return { snapshot: shown, page: await readGamePage(store, { gameId: game }, viewing) };
  });
  const [{ snapshot, page }, clock] = await Promise.all([
    read,
    publicSchedule.clockOf(addressee.id),
  ]);
  if (!snapshot.ok || !page.ok) return notFound();
  const words = gameWords();
  // Where the game is played and its number are the published schedule's to say (step
  // 2.39), as on the game's card; a game the schedule does not list shows neither. Only
  // this game's facts are read, not its whole season: this page is read again at every
  // "Show newer plays" of a game under way.
  const listed = await publicSchedule.gameFactsOf(
    addressee.id,
    page.value.game.seasonId,
    page.value.game.id,
  );
  const place = listed === undefined ? undefined : placeOf(listed);
  // The game's one public truth, as the home page, the schedule and a team's page read it
  // (step 2.159): a game whose start has passed with no score is awaiting it, a reopened
  // game shows the result as it stood (S-47).
  // A game with a day and no time is not yet read here with its day (the schedule's facts
  // of one game do not carry it): its page reads it as upcoming until it has a time.
  const truth = gameTruthOf(page.value, clock);
  // Only a game still to come says its day on the board.
  const when =
    truth.state === 'upcoming'
      ? boardWhen(page.value.game.startsAt, clock.timeZone, page.value.game.status)
      : undefined;
  // A forfeit has no box scores (P7 §5.6), and a game being corrected shows its result as
  // it stood, not the sheet or plays the correction is changing (T-384).
  const corrected = truth.state === 'being-corrected';
  // A game still to come, or put off, ends with its two teams and their records. Read only
  // for such a game: never for one under way, whose page is read again and again.
  const pending = ['scheduled', 'postponed', 'cancelled'].includes(page.value.game.status);
  const teams =
    pending && listed !== undefined
      ? await loadTeamCardsOf(
          publicStats.readStoreOf(addressee.id),
          addressee,
          { id: page.value.game.seasonId, slug: listed.season.slug },
          listed.season.isCurrent,
          [page.value.scoreboard.away.teamId, page.value.scoreboard.home.teamId],
        )
      : [];
  return (
    <GameContent
      view={{
        leagueId: addressee.id,
        title: gameTitle(page.value),
        status: page.value.game.status,
        truth,
        start: truthLine(page.value.game.startsAt, clock.timeZone, truth),
        corrected: correctedText(snapshot.value.correctedOn ?? page.value.game.correctedOn),
        snapshot: snapshot.value,
        snapshotAddress: leagueApiUrl(addressee, ['games', snapshot.value.gameId, 'snapshot']),
        selfAddress: leagueUrl(addressee, 'game', { game: snapshot.value.gameId }),
        boxScores: truth.state === 'final' ? buildBoxScores(page.value) : null,
        plays: corrected ? [] : buildPlays(page.value, words),
        // Back to the schedule the game is on: an earlier season's, when it is one of those.
        scheduleAddress: leagueUrl(
          addressee,
          'schedule',
          listed === undefined || listed.season.isCurrent ? {} : { season: listed.season.slug },
        ),
        ...(listed === undefined || listed.number === null
          ? {}
          : { numberText: t('schedule.gameNumber', { number: listed.number }) }),
        board: {
          colors: boardColors(page.value),
          ...(when === undefined ? {} : { when }),
          ...(place === undefined ? {} : { placeText: place }),
          // "Final, OT" for a game won in overtime (P7 §5.6); "Final" alone otherwise.
          finalPill: boardFinalPill(page.value),
        },
        teams,
        // A team whose players are kept from the public: the box score says so already.
        ...(page.value.boxScores.some((box) => !box.playerLinesShown)
          ? {
              staffNumbersAddress: staffNumbersAddress(addressee, {
                page: 'game',
                game: snapshot.value.gameId,
              }),
            }
          : {}),
      }}
    />
  );
}
